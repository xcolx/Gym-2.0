// Chats only change online, the only offline change is the text in the input field: once it is sent, `inputUUID` is
// set and the sync sends it (again) with that UUID until the server accepted it.

import { chatChanged, chatFromDTO, messageFromDTO, replaceChatMembers, type ChatDTO } from "@/lib/api";
import type { GymDB } from "@/lib/db";
import { newUUID } from "@/lib/uuid";
import type { Chat } from "@/types/models";
import { getOrThrow, write } from "./write";

const chatTables = (db: GymDB) => [db.chats, db.chatMembers, db.messages];

/**
 * The text in the input field of the chat, kept while offline. Not pushed by itself. Doesn't change a text that is
 * queued (`inputUUID` set): it's sent with that UUID, so it must stay the same until the server accepted it.
 */
export async function setChatInput(chatId: number, text: string): Promise<void> {
  await write(
    (db) => [db.chats],
    async (db) => {
      const chat = await db.chats.get(chatId);
      if (!chat || chat.inputUUID || chat.input === text) return;
      await db.chats.put({ ...chat, input: text });
    },
    { sync: false },
  );
}

/**
 * Marks the text in the input field as sent (`SyncService.sendMessage` before it sends): it gets a UUID, which the
 * sync sends it with until the server accepted it. Returns the UUID, null if the input is empty.
 */
export async function queueChatInput(chatId: number): Promise<string | null> {
  return write(
    (db) => [db.chats],
    async (db) => {
      const chat = await getOrThrow(db.chats, chatId, "chat");
      if (chat.input.trim() === "") return null;
      if (chat.inputUUID) return chat.inputUUID;
      const inputUUID = newUUID();
      await db.chats.put({ ...chat, inputUUID });
      return inputUUID;
    },
  );
}

/**
 * Stores a chat the server returned after creating, changing or joining it (`ChatSync.store`): updates the metadata
 * and members and adds the messages that aren't stored yet. The sync loads the profiles of new members.
 */
export async function storeChat(dto: ChatDTO): Promise<Chat> {
  return write(chatTables, (db) => storeChatIn(db, dto), { sync: false });
}

/** `storeChat` inside a transaction over chats, chatMembers and messages, e.g. for every chat of a pull */
export async function storeChatIn(db: GymDB, dto: ChatDTO, { complete = false }: { complete?: boolean } = {}): Promise<Chat> {
  const existing = await db.chats.get(dto.id);
  const chat = chatFromDTO(dto, existing);
  if (!existing || chatChanged(existing, chat)) await db.chats.put(chat);

  const members = await db.chatMembers.where("chatId").equals(dto.id).toArray();
  const { put, deletedUserIds } = replaceChatMembers(dto.id, dto.members, members);
  if (deletedUserIds.length > 0) await db.chatMembers.bulkDelete(deletedUserIds.map((userId) => [dto.id, userId]));
  if (put.length > 0) await db.chatMembers.bulkPut(put);

  // Deleted by their sender: removed, or never stored if they were sent and deleted since the last sync
  const deletedIds = dto.messages.filter((message) => message.deletedAt).map((message) => message.id);
  if (deletedIds.length > 0) await db.messages.bulkDelete(deletedIds);
  const messages = dto.messages.filter((message) => !message.deletedAt);
  if (complete) {
    // The full list of the chat (GET /chat/get_all): the messages it doesn't contain anymore were deleted, also
    // the ones a delta never reported (e.g. deleted in the admin, or before this device pulled the delta)
    const ids = new Set(messages.map((message) => message.id));
    const stored = await db.messages.where("chatId").equals(dto.id).primaryKeys();
    const removed = stored.filter((id) => !ids.has(id));
    if (removed.length > 0) await db.messages.bulkDelete(removed);
  }
  if (messages.length > 0) {
    const known = new Set(
      (await db.messages.bulkGet(messages.map((message) => message.id))).flatMap((message) =>
        message ? [message.serverId] : [],
      ),
    );
    const added = messages.filter((message) => !known.has(message.id)).map(messageFromDTO);
    if (added.length > 0) await db.messages.bulkAdd(added);
  }
  return chat;
}

/** Removes a message locally after its sender deleted it online, the next pull brings the chat's new preview */
export async function deleteMessageLocally(messageId: number): Promise<void> {
  await write(
    (db) => [db.messages],
    async (db) => {
      await db.messages.delete(messageId);
    },
    { sync: false },
  );
}

/** Removes a chat with its members and messages locally, after the user left or deleted it online (ChatInfoView) */
export async function deleteChatLocally(chatId: number): Promise<void> {
  await write(
    chatTables,
    async (db) => {
      await db.messages.where("chatId").equals(chatId).delete();
      await db.chatMembers.where("chatId").equals(chatId).delete();
      await db.chats.delete(chatId);
    },
    { sync: false },
  );
}

/** Removes a member locally after the server removed them, the next sync brings the server's members (ChatInfoView) */
export async function removeChatMemberLocally(chatId: number, userId: number): Promise<void> {
  await write(
    (db) => [db.chatMembers],
    async (db) => {
      await db.chatMembers.delete([chatId, userId]);
    },
    { sync: false },
  );
}
