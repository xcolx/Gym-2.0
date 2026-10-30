import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deleteUserDb, getSyncTime, openUserDb, setSyncTime, type GymDB } from "@/lib/db";
import { makeChatDTO, makeMessageDTO } from "@/test/fixtures";
import { ChatSync } from "./chat-sync";
import { FakeServer, offline, rejected } from "./testing/fake-server";

const USER_ID = 42;
let db: GymDB;
let server: FakeServer;
let chatSync: ChatSync;

const photo = { data: new Blob(["x"]), filename: "image.jpg", mimeType: "image/jpeg" };

beforeEach(async () => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  db = (await openUserDb(USER_ID))!;
  server = new FakeServer();
  server.chats.set(7, makeChatDTO());
  chatSync = new ChatSync(db, server.api);
  await chatSync.pull();
});

afterEach(async () => {
  await deleteUserDb(USER_ID);
  vi.restoreAllMocks();
});

const queue = (input: string, inputUUID = "uuid-1") => db.chats.update(7, { input, inputUUID });

describe("sending", () => {
  it("knows whether a message is queued and sends nothing without one", async () => {
    expect(await chatSync.hasQueuedMessages()).toBe(false);
    expect(await chatSync.pushMessages()).toEqual([]);
    expect(await chatSync.send(7)).toBeNull();
    expect(await chatSync.send(404)).toBeNull();
    expect(server.api.chats.sendMessage).not.toHaveBeenCalled();

    await queue("Hi");
    expect(await chatSync.hasQueuedMessages()).toBe(true);
  });

  it("drops the UUID of an input that is only whitespace without sending it", async () => {
    await queue("   ");
    expect(await chatSync.send(7)).toBeNull();
    expect(server.api.chats.sendMessage).not.toHaveBeenCalled();
    expect(await db.chats.get(7)).toMatchObject({ input: "   ", inputUUID: null });
  });

  it("keeps the next message the user started while the first one was sent", async () => {
    await queue("First");
    const send = vi.mocked(server.api.chats.sendMessage);
    const original = send.getMockImplementation()!;
    send.mockImplementationOnce(async (...args) => {
      // typed while the request ran (setChatInput doesn't change a queued input, a new queue would)
      await db.chats.update(7, { input: "First and more" });
      return original(...args);
    });
    await chatSync.send(7);
    expect(await db.chats.get(7)).toMatchObject({ input: "First and more", inputUUID: null, latestMessagePreview: "First" });
  });

  it("keeps a UUID that was replaced while the message was sent", async () => {
    await queue("First");
    const send = vi.mocked(server.api.chats.sendMessage);
    const original = send.getMockImplementation()!;
    send.mockImplementationOnce(async (...args) => {
      await db.chats.update(7, { input: "Second", inputUUID: "uuid-2" });
      return original(...args);
    });
    await chatSync.send(7);
    expect(await db.chats.get(7)).toMatchObject({ input: "Second", inputUUID: "uuid-2" });
  });

  it("shortens the preview to the maximum length", async () => {
    await queue("x".repeat(200));
    await chatSync.send(7);
    const preview = (await db.chats.get(7))!.latestMessagePreview!;
    expect(preview.length).toBeLessThan(200);
    expect("x".repeat(200).startsWith(preview)).toBe(true);
  });

  it("removes a message a repeated send returns as deleted", async () => {
    await db.messages.add({ serverId: 900, chatId: 7, senderId: USER_ID, createdAt: new Date(), content: "Hi", imageUrl: null });
    await queue("Hi");
    vi.mocked(server.api.chats.sendMessage).mockResolvedValueOnce(
      makeMessageDTO({ id: 900, senderId: USER_ID, content: null, deletedAt: "2026-10-15T09:00:00+00:00" }),
    );
    await chatSync.send(7);
    expect(await db.messages.get(900)).toBeUndefined();
    expect((await db.chats.get(7))?.inputUUID).toBeNull();
  });

  it("doesn't store a message twice that a repeated send returns again", async () => {
    await queue("Hi");
    const dto = makeMessageDTO({ id: 901, senderId: USER_ID });
    vi.mocked(server.api.chats.sendMessage).mockResolvedValue(dto);
    await chatSync.send(7);
    await queue("Hi");
    await chatSync.send(7);
    expect(await db.messages.where("chatId").equals(7).count()).toBe(1);
  });

  it("throws when offline and keeps the queued input, the other chats are still sent by a later push", async () => {
    server.chats.set(8, makeChatDTO({ id: 8, name: "Other" }));
    await chatSync.store(makeChatDTO({ id: 8, name: "Other" }));
    await queue("Hi");
    await db.chats.update(8, { input: "Yo", inputUUID: "uuid-8" });
    vi.mocked(server.api.chats.sendMessage).mockRejectedValueOnce(offline());
    await expect(chatSync.pushMessages()).rejects.toMatchObject({ kind: "transport" });
    expect(await chatSync.hasQueuedMessages()).toBe(true);

    expect(await chatSync.pushMessages()).toEqual([]);
    expect(await chatSync.hasQueuedMessages()).toBe(false);
  });

  it("collects the messages of every rejected chat", async () => {
    await queue("Hi");
    vi.mocked(server.api.chats.sendMessage).mockRejectedValueOnce(rejected(403, "Not friends"));
    expect(await chatSync.pushMessages()).toEqual(["Your message could not be sent: Not friends"]);
    expect(await db.chats.get(7)).toMatchObject({ input: "Hi", inputUUID: null });
  });

  it("throws if a photo couldn't be sent and stores nothing", async () => {
    vi.mocked(server.api.chats.sendMessage).mockRejectedValueOnce(offline());
    await expect(chatSync.sendPhoto(7, photo, "Caption")).rejects.toMatchObject({ kind: "transport" });
    expect(await db.messages.count()).toBe(0);
    expect((await db.chats.get(7))?.latestMessagePreview).toBeNull();
  });

  it("sends every photo with a new client UUID", async () => {
    await chatSync.sendPhoto(7, photo, null);
    await chatSync.sendPhoto(7, photo, null);
    const [first, second] = vi.mocked(server.api.chats.sendMessage).mock.calls.map(([, options]) => options.clientUuid);
    expect(first).toEqual(expect.any(String));
    expect(first).not.toBe(second);
  });
});

describe("marking read", () => {
  beforeEach(async () => {
    server.chats.get(7)!.messages.push(makeMessageDTO({ id: 1 }), makeMessageDTO({ id: 2, content: "Second" }));
    await chatSync.store(structuredClone(server.chats.get(7)!));
  });

  it("marks the newest message only, and only if it is newer than the read one", async () => {
    await chatSync.markRead(7, USER_ID);
    expect(server.api.chats.markRead).toHaveBeenCalledWith(7, 2);
    expect((await db.chatMembers.get([7, USER_ID]))?.lastReadMessageId).toBe(2);

    await chatSync.markRead(7, USER_ID);
    expect(server.api.chats.markRead).toHaveBeenCalledTimes(1);
  });

  it("does nothing for an empty chat or a user who isn't a member", async () => {
    await chatSync.markRead(7, 1234);
    await chatSync.store(makeChatDTO({ id: 8 }));
    await chatSync.markRead(8, USER_ID);
    expect(server.api.chats.markRead).not.toHaveBeenCalled();
  });

  it("can mark again after a failed request", async () => {
    vi.mocked(server.api.chats.markRead).mockRejectedValueOnce(offline());
    await expect(chatSync.markRead(7, USER_ID)).rejects.toMatchObject({ kind: "transport" });
    expect((await db.chatMembers.get([7, USER_ID]))?.lastReadMessageId).toBe(0);
    await chatSync.markRead(7, USER_ID);
    expect(server.api.chats.markRead).toHaveBeenCalledTimes(2);
    expect((await db.chatMembers.get([7, USER_ID]))?.lastReadMessageId).toBe(2);
  });

  it("doesn't move the read state back if a pull stored a newer one in the meantime", async () => {
    vi.mocked(server.api.chats.markRead).mockImplementationOnce(async () => {
      await db.chatMembers.update([7, USER_ID], { lastReadMessageId: 5, admin: null });
    });
    await chatSync.markRead(7, USER_ID);
    expect((await db.chatMembers.get([7, USER_ID]))?.lastReadMessageId).toBe(5);
  });
});

describe("pulling", () => {
  it("loads all chats first, then uses the deltas with their sync times", async () => {
    expect(server.api.chats.all).toHaveBeenCalledTimes(1);
    const first = await getSyncTime(db, "chats");
    expect(first).toBeDefined();

    await chatSync.pull();
    expect(server.api.chats.changes).toHaveBeenCalledWith(first);
    expect(server.api.chats.all).toHaveBeenCalledTimes(1);
    expect(await getSyncTime(db, "chats")).not.toBe(first);
  });

  it("runs one pull for callers that pull at the same time", async () => {
    await Promise.all([chatSync.pull(), chatSync.pull(), chatSync.pull()]);
    expect(server.api.chats.changes).toHaveBeenCalledTimes(1);
    await chatSync.pull();
    expect(server.api.chats.changes).toHaveBeenCalledTimes(2);
  });

  it("can pull again after a pull failed", async () => {
    vi.mocked(server.api.chats.changes).mockRejectedValueOnce(offline());
    await expect(chatSync.pull()).rejects.toMatchObject({ kind: "transport" });
    await chatSync.pull();
    expect(server.api.chats.changes).toHaveBeenCalledTimes(2);
  });

  it("loads all chats instead of a rejected delta", async () => {
    vi.mocked(server.api.chats.changes).mockRejectedValueOnce(rejected(422, "Invalid sync time"));
    await chatSync.pull();
    expect(server.api.chats.all).toHaveBeenCalledTimes(2);
  });

  it("stores the chats and the members of a delta", async () => {
    const changes = vi.mocked(server.api.chats.changes);
    changes.mockResolvedValueOnce({
      chats: [makeChatDTO({ name: "Renamed", messages: [makeMessageDTO({ id: 3 })] })],
      readStates: [{ chatId: 7, members: [{ userId: USER_ID, lastReadMessageId: 3, admin: null }] }],
      syncTime: "999",
    });
    await chatSync.pull();
    expect(await db.chats.get(7)).toMatchObject({ name: "Renamed" });
    expect(await db.messages.get(3)).toBeDefined();
    // the read states replace the members: 9 left the group
    expect(await db.chatMembers.where("chatId").equals(7).toArray()).toEqual([{ chatId: 7, userId: USER_ID, lastReadMessageId: 3, admin: null }]);
    expect(await getSyncTime(db, "chats")).toBe("999");
  });

  it("keeps the sync time of an incomplete delta whose full reload isn't due yet", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      // the first pull (in beforeEach) was a full load just now
      await setSyncTime(db, "chats", "1");
      vi.mocked(server.api.chats.changes).mockResolvedValueOnce({
        chats: [],
        readStates: [{ chatId: 7, members: [] }, { chatId: 99, members: [] }],
        syncTime: "500",
      });
      await chatSync.pull();
      expect(await getSyncTime(db, "chats")).toBe("1");
      expect(server.api.chats.all).toHaveBeenCalledTimes(1);
      // the known chat was still applied
      expect(await db.chatMembers.where("chatId").equals(7).count()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("removes the chats a full list doesn't contain, with their members and messages", async () => {
    server.chats.get(7)!.messages.push(makeMessageDTO({ id: 1 }));
    server.chats.set(8, makeChatDTO({ id: 8 }));
    // without a sync time the next pull loads everything
    await db.meta.delete("syncTime.chats");
    await chatSync.pull();
    expect(await db.messages.count()).toBe(1);

    server.chats.delete(7);
    await db.meta.delete("syncTime.chats");
    await chatSync.pull();
    expect(await db.chats.toCollection().primaryKeys()).toEqual([8]);
    expect(await db.messages.count()).toBe(0);
    expect(await db.chatMembers.where("chatId").equals(7).count()).toBe(0);
  });
});
