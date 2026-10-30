import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ChatDTO } from "@/lib/api";
import { deleteUserDb, openUserDb, type GymDB } from "@/lib/db";
import { unreadCountIn } from "./chat-hooks";
import { deleteChatLocally, deleteMessageLocally, queueChatInput, setChatInput, storeChat, storeChatIn } from "./chats";
import { chatsWithMembers } from "./queries";

const USER_ID = 42;
let db: GymDB;

const chatDTO: ChatDTO = {
  id: 4,
  groupChat: false,
  name: null,
  imageUrl: null,
  createdAt: "2026-10-15T08:00:00+00:00",
  createdBy: 42,
  public: false,
  latestMessageTimestamp: "2026-10-15T08:01:00+00:00",
  latestMessagePreview: "Hi",
  latestMessageSenderId: 7,
  members: [
    { userId: 42, lastReadMessageId: 0, admin: null },
    { userId: 7, lastReadMessageId: 1, admin: null },
  ],
  messages: [{ id: 1, chatId: 4, senderId: 7, createdAt: "2026-10-15T08:01:00+00:00", content: "Hi", imageUrl: null }],
};

beforeEach(async () => {
  db = (await openUserDb(USER_ID))!;
  await storeChat(chatDTO);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await deleteUserDb(USER_ID);
});

describe("chat input", () => {
  it("queues the input with one UUID and doesn't change a queued text", async () => {
    await setChatInput(4, "Hello");
    const uuid = await queueChatInput(4);
    expect(uuid).not.toBeNull();
    expect(await queueChatInput(4)).toBe(uuid);

    // sent with that UUID until the server accepted it, so it must stay the same
    await setChatInput(4, "");
    expect(await db.chats.get(4)).toMatchObject({ input: "Hello", inputUUID: uuid });
  });

  it("doesn't queue an empty input", async () => {
    await setChatInput(4, "   ");
    expect(await queueChatInput(4)).toBeNull();
    expect((await db.chats.get(4))?.inputUUID).toBeNull();
  });
});

describe("stored chats", () => {
  it("counts the unread messages of others", async () => {
    const [chat] = await chatsWithMembers(db);
    expect(await unreadCountIn(db, chat, USER_ID)).toBe(1);
    expect(await unreadCountIn(db, chat, 7)).toBe(0);
  });

  it("adds only new messages and removes a chat with its members and messages", async () => {
    await storeChat({
      ...chatDTO,
      messages: [
        ...chatDTO.messages,
        { id: 2, chatId: 4, senderId: 42, createdAt: "2026-10-15T08:02:00+00:00", content: "Hey", imageUrl: null },
      ],
    });
    expect(await db.messages.count()).toBe(2);

    await deleteChatLocally(4);
    expect(await db.chats.count()).toBe(0);
    expect(await db.messages.count()).toBe(0);
    expect(await db.chatMembers.count()).toBe(0);
  });
});

describe("deleted messages", () => {
  const message = (id: number, deletedAt: string | null = null) => ({
    id,
    chatId: 4,
    senderId: 7,
    createdAt: "2026-10-15T08:02:00+00:00",
    content: deletedAt ? null : `Message ${id}`,
    imageUrl: null,
    deletedAt,
  });

  it("removes a message a delta delivers as deleted and doesn't store one it never had", async () => {
    await storeChat({ ...chatDTO, messages: [message(2)] });
    expect(await db.messages.count()).toBe(2);

    await storeChat({ ...chatDTO, messages: [message(2, "2026-10-15T08:05:00+00:00"), message(3, "2026-10-15T08:05:00+00:00")] });
    expect((await db.messages.toArray()).map((stored) => stored.serverId)).toEqual([1]);
  });

  it("removes the messages a full list doesn't contain anymore, a delta keeps them", async () => {
    await storeChat({ ...chatDTO, messages: [message(2), message(3)] });

    // A delta only contains the new messages
    await storeChat({ ...chatDTO, messages: [] });
    expect(await db.messages.count()).toBe(3);

    // The full list of GET /chat/get_all, e.g. after message 2 was deleted in the admin
    await db.transaction("rw", [db.chats, db.chatMembers, db.messages], () =>
      storeChatIn(db, { ...chatDTO, messages: [chatDTO.messages[0], message(3)] }, { complete: true }),
    );
    expect((await db.messages.toArray()).map((stored) => stored.serverId)).toEqual([1, 3]);
  });

  it("removes a message locally after the user deleted it", async () => {
    await deleteMessageLocally(1);
    expect(await db.messages.count()).toBe(0);
  });
});
