// Port of ios/Gym 2.0/Core/Services/Sync/ChatSync.swift. Sending needs no lock: two tabs sending the same queued input
// at once get the same message back, since it's sent with the same UUID.

import Dexie from "dexie";

import {
  errorMessage,
  isRejection,
  messageFromDTO,
  parseServerDate,
  replaceChatMembers,
  type ChatDTO,
  type ChatDeltaDTO,
  type ImageUpload,
  type MessageDTO,
} from "@/lib/api";
import { getSyncTime, setSyncTime, type GymDB } from "@/lib/db";
import { MAX_PREVIEW_LENGTH, PHOTO_PREVIEW } from "@/lib/domain/chat-feature";
import { prefixCharacters } from "@/lib/domain/format";
import { storeChatIn } from "@/lib/repo/chats";
import { newUUID } from "@/lib/uuid";
import type { Chat } from "@/types/models";
import type { SyncApi } from "./api";
import { logSync } from "./log";

/**
 * An incomplete delta loads all chats again at most this often: the polls run every second in an open chat, and the
 * backend allows 10 GET /chats per minute. In between the delta is used (without its sync time, so the next
 * one contains the same changes again).
 */
export const FULL_CHAT_RELOAD_INTERVAL_MS = 30_000;

export class ChatSync {
  /** When all chats were loaded the last time (ms), for FULL_CHAT_RELOAD_INTERVAL_MS */
  private lastFullPull: number | null = null;

  /** The sync and the polling of an open chat can pull at the same time, the second waits for the first instead */
  private runningPull: Promise<void> | null = null;
  /** The chat and message ids a mark read request is running for */
  private readonly markingRead = new Set<string>();

  constructor(
    private readonly db: GymDB,
    private readonly api: SyncApi,
  ) {}

  private chatTransaction<T>(change: () => Promise<T>): Promise<T> {
    const db = this.db;
    return db.transaction("rw", [db.chats, db.chatMembers, db.messages, db.meta], change);
  }

  // MARK: - Push

  /** Returns the messages to show for the messages the server rejected */
  async pushMessages(): Promise<string[]> {
    const queued = await this.db.chats.filter((chat) => chat.inputUUID !== null).toArray();
    const rejected: string[] = [];
    for (const chat of queued) {
      const message = await this.send(chat.serverId);
      if (message) rejected.push(message);
    }
    return rejected;
  }

  /** Whether a chat has a message waiting to be sent */
  async hasQueuedMessages(): Promise<boolean> {
    return (await this.db.chats.filter((chat) => chat.inputUUID !== null).count()) > 0;
  }

  /**
   * Sends the text in the input field of the chat. Throws if the server couldn't be reached, the text and its UUID
   * are kept then. A message the server rejects stays in the input field, but isn't sent again: returns the message
   * to show then.
   */
  async send(chatId: number): Promise<string | null> {
    const chat = await this.db.chats.get(chatId);
    const clientUuid = chat?.inputUUID;
    if (!chat || !clientUuid) return null;
    const text = chat.input.trim();
    if (text === "") {
      await this.clearInputUUID(chatId, clientUuid);
      return null;
    }

    try {
      const dto = await this.api.chats.sendMessage(chatId, { text, clientUuid });
      await this.chatTransaction(async () => {
        const current = await this.db.chats.get(chatId);
        if (!current) return;
        await this.insert(dto);
        const updated: Chat = {
          ...current,
          latestMessageTimestamp: parseServerDate(dto.createdAt),
          latestMessagePreview: prefixCharacters(text, MAX_PREVIEW_LENGTH),
          latestMessageSenderId: dto.senderId,
        };
        if (current.inputUUID === clientUuid) {
          updated.inputUUID = null;
          // The user may have started the next message in the meantime
          if (current.input.trim() === text) updated.input = "";
        }
        await this.db.chats.put(updated);
      });
      return null;
    } catch (error) {
      if (!isRejection(error)) throw error;
      logSync.error(`The server rejected a message to the chat ${chatId}: ${errorMessage(error)}`);
      await this.clearInputUUID(chatId, clientUuid);
      return `Your message could not be sent: ${errorMessage(error)}`;
    }
  }

  private async clearInputUUID(chatId: number, clientUuid: string): Promise<void> {
    await this.chatTransaction(async () => {
      const current = await this.db.chats.get(chatId);
      if (current?.inputUUID === clientUuid) await this.db.chats.put({ ...current, inputUUID: null });
    });
  }

  /**
   * Sends a photo with an optional caption right away. Photos aren't stored locally, so unlike text they aren't sent
   * again by a later sync: throws if it couldn't be sent.
   */
  async sendPhoto(chatId: number, upload: ImageUpload, caption: string | null): Promise<void> {
    const dto = await this.api.chats.sendMessage(chatId, { text: caption, image: upload, clientUuid: newUUID() });
    await this.chatTransaction(async () => {
      const current = await this.db.chats.get(chatId);
      if (!current) return;
      await this.insert(dto);
      await this.db.chats.put({
        ...current,
        latestMessageTimestamp: parseServerDate(dto.createdAt),
        // Like the server's preview
        latestMessagePreview: caption ? prefixCharacters(caption, MAX_PREVIEW_LENGTH) : PHOTO_PREVIEW,
        latestMessageSenderId: dto.senderId,
      });
    });
  }

  /**
   * Marks the newest message of the chat as read by the user, if it isn't yet. A request that is still running for
   * the chat and message isn't sent again, e.g. when a chat asks again for a new message while it's being marked.
   */
  async markRead(chatId: number, userId: number): Promise<void> {
    const newest = await this.db.messages
      .where("[chatId+serverId]")
      .between([chatId, Dexie.minKey], [chatId, Dexie.maxKey])
      .last();
    const member = await this.db.chatMembers.get([chatId, userId]);
    if (!newest || !member || member.lastReadMessageId >= newest.serverId) return;
    const key = `${chatId}:${newest.serverId}`;
    if (this.markingRead.has(key)) return;
    this.markingRead.add(key);
    try {
      await this.api.chats.markRead(chatId, newest.serverId);
    } finally {
      this.markingRead.delete(key);
    }
    await this.chatTransaction(async () => {
      // The members may have been replaced by a pull in the meantime
      const current = await this.db.chatMembers.get([chatId, userId]);
      if (current && current.lastReadMessageId < newest.serverId) {
        await this.db.chatMembers.put({ ...current, lastReadMessageId: newest.serverId });
      }
    });
  }

  /** Stores a chat the server returned for a create, an update or a join */
  async store(dto: ChatDTO): Promise<Chat> {
    return this.chatTransaction(() => storeChatIn(this.db, dto));
  }

  // MARK: - Pull

  async pull(): Promise<void> {
    if (this.runningPull) return this.runningPull;
    const task = this.pullOnce().finally(() => {
      if (this.runningPull === task) this.runningPull = null;
    });
    this.runningPull = task;
    return task;
  }

  private async pullOnce(): Promise<void> {
    const syncTime = await getSyncTime(this.db, "chats");
    if (syncTime) {
      let delta: ChatDeltaDTO | null = null;
      try {
        delta = await this.api.chats.changes(syncTime);
      } catch (error) {
        // e.g. a sync time the server doesn't accept anymore, load everything instead
        if (!isRejection(error)) throw error;
      }
      if (delta) {
        const received = delta;
        const complete = await this.chatTransaction(async () => {
          const complete = await this.apply(received);
          if (complete) await setSyncTime(this.db, "chats", received.syncTime);
          return complete;
        });
        // A chat was missed somehow: everything is loaded again, but not with every poll
        if (complete || !this.isFullPullAllowed()) return;
      }
    }

    this.lastFullPull = Date.now();
    const list = await this.api.chats.all();
    await this.chatTransaction(async () => {
      for (const dto of list.chats) await storeChatIn(this.db, dto, { complete: true });
      await this.removeChats(new Set(list.chats.map((chat) => chat.id)));
      await setSyncTime(this.db, "chats", list.syncTime);
    });
  }

  private isFullPullAllowed(): boolean {
    return this.lastFullPull === null || Date.now() - this.lastFullPull >= FULL_CHAT_RELOAD_INTERVAL_MS;
  }

  /** Returns false if the read states contain a chat that isn't stored */
  private async apply(delta: ChatDeltaDTO): Promise<boolean> {
    for (const dto of delta.chats) await storeChatIn(this.db, dto);

    let complete = true;
    // The read states contain every chat of the user
    for (const readState of delta.readStates) {
      if (!(await this.db.chats.get(readState.chatId))) {
        logSync.error(`Unknown chat ${readState.chatId} in the read states`);
        complete = false;
        continue;
      }
      const members = await this.db.chatMembers.where("chatId").equals(readState.chatId).toArray();
      const { put, deletedUserIds } = replaceChatMembers(readState.chatId, readState.members, members);
      if (deletedUserIds.length > 0) {
        await this.db.chatMembers.bulkDelete(deletedUserIds.map((userId) => [readState.chatId, userId]));
      }
      if (put.length > 0) await this.db.chatMembers.bulkPut(put);
    }
    await this.removeChats(new Set(delta.readStates.map((readState) => readState.chatId)));
    return complete;
  }

  private async insert(dto: MessageDTO): Promise<void> {
    // A repeated send of a message that was deleted in the meantime returns it as deleted
    if (dto.deletedAt) await this.db.messages.delete(dto.id);
    else if (!(await this.db.messages.get(dto.id))) await this.db.messages.add(messageFromDTO(dto));
  }

  /** The user isn't a member of the other chats anymore */
  private async removeChats(except: Set<number>): Promise<void> {
    const removed = (await this.db.chats.toCollection().primaryKeys()).filter((id) => !except.has(id));
    for (const chatId of removed) {
      await this.db.messages.where("chatId").equals(chatId).delete();
      await this.db.chatMembers.where("chatId").equals(chatId).delete();
      await this.db.chats.delete(chatId);
    }
  }
}
