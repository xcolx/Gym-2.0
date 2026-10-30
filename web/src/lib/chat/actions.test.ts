import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, chatApi, friendApi, reportApi, type ChatDTO, type UserDTO } from "@/lib/api";
import { deleteUserDb, openUserDb, type GymDB } from "@/lib/db";
import { storeChat, storeUser } from "@/lib/repo";
import { blockUser, joinPublicGroup, leaveGroup, report, unblockUser } from "./actions";

const USER_ID = 42;
let db: GymDB;

const group: ChatDTO = {
  id: 4,
  groupChat: true,
  name: "Gym",
  imageUrl: null,
  createdAt: "2026-10-15T08:00:00+00:00",
  createdBy: 7,
  public: true,
  latestMessageTimestamp: "2026-10-15T08:01:00+00:00",
  latestMessagePreview: "Hi",
  latestMessageSenderId: 7,
  members: [
    { userId: 42, lastReadMessageId: 0, admin: null },
    { userId: 7, lastReadMessageId: 1, admin: null },
  ],
  messages: [{ id: 1, chatId: 4, senderId: 7, createdAt: "2026-10-15T08:01:00+00:00", content: "Hi", imageUrl: null }],
};

const user: UserDTO = {
  id: 7,
  username: "friend",
  email: null,
  profileImageUrl: "",
  profileIconUrl: "",
  bodyweight: null,
  schemeColor: "#FF0000",
  weightUnit: null,
  distanceUnit: null,
  language: null,
  createdAt: "2026-10-01T10:00:00+00:00",
};

beforeEach(async () => {
  db = (await openUserDb(USER_ID))!;
});

afterEach(async () => {
  vi.restoreAllMocks();
  await deleteUserDb(USER_ID);
});

describe("groups", () => {
  it("stores a joined group with its messages, also without a running sync engine", async () => {
    vi.spyOn(chatApi, "join").mockResolvedValue(group);
    expect(await joinPublicGroup(4)).toBe(4);
    expect(await db.chats.get(4)).toMatchObject({ name: "Gym" });
    expect(await db.messages.count()).toBe(1);
    expect(await db.chatMembers.count()).toBe(2);
  });

  it("removes the chat locally after leaving, also if the server already removed the user", async () => {
    await storeChat(group);
    vi.spyOn(chatApi, "removeMember").mockRejectedValue(new ApiError("server", { status: 404, message: "Not found" }));
    await leaveGroup(4, USER_ID);
    expect(await db.chats.count()).toBe(0);
    expect(await db.messages.count()).toBe(0);
    expect(await db.chatMembers.count()).toBe(0);
  });

  it("keeps the chat if leaving failed", async () => {
    await storeChat(group);
    vi.spyOn(chatApi, "removeMember").mockRejectedValue(new ApiError("transport"));
    await expect(leaveGroup(4, USER_ID)).rejects.toThrow(ApiError);
    expect(await db.chats.count()).toBe(1);
  });
});

describe("blocking", () => {
  it("blocks a user and unblocks them again", async () => {
    await storeUser(user, { isFriend: true });
    const block = vi.spyOn(friendApi, "block").mockResolvedValue(undefined as never);
    await blockUser(7);
    expect(block).toHaveBeenCalledWith(7);
    expect(await db.users.get(7)).toMatchObject({ isBlocked: true, isFriend: false });

    vi.spyOn(friendApi, "unblock").mockRejectedValue(new ApiError("server", { status: 404, message: "Not found" }));
    await unblockUser(7);
    expect(await db.users.get(7)).toMatchObject({ isBlocked: false });
  });
});

describe("reporting", () => {
  it("reports a user, a chat or a message without blocking", async () => {
    const send = vi.spyOn(reportApi, "report").mockResolvedValue(undefined);
    const block = vi.fn();
    await report({ kind: "user", id: 7, username: "anna" }, "Spam", block);
    await report({ kind: "chat", id: 4, name: "Lifters" }, "Offensive name", block);
    await report({ kind: "message", id: 12, senderName: "anna" }, "Insult", block);
    expect(send.mock.calls).toEqual([
      [{ reportedUserId: 7 }, "Spam"],
      [{ reportedChatId: 4 }, "Offensive name"],
      [{ reportedMessageId: 12 }, "Insult"],
    ]);
    expect(block).not.toHaveBeenCalled();
  });

  it("blocks the user first for Block and Report", async () => {
    await storeUser(user, { isFriend: true });
    vi.spyOn(friendApi, "block").mockResolvedValue(undefined as never);
    const send = vi.spyOn(reportApi, "report").mockResolvedValue(undefined);
    await report({ kind: "user", id: 7, username: user.username, blocks: true }, "Spam");
    expect(await db.users.get(7)).toMatchObject({ isBlocked: true, isFriend: false });
    expect(send).toHaveBeenCalledWith({ reportedUserId: 7 }, "Spam");
  });

  it("deletes the message after reporting it for Delete and Report", async () => {
    const calls: string[] = [];
    vi.spyOn(reportApi, "report").mockImplementation(async () => void calls.push("report"));
    vi.spyOn(chatApi, "deleteMessage").mockImplementation(async () => void calls.push("delete"));
    await report({ kind: "message", id: 12, senderName: "anna", deletes: true }, "Spam");
    expect(calls).toEqual(["report", "delete"]);
  });

  it("doesn't delete the message if the report failed", async () => {
    vi.spyOn(reportApi, "report").mockRejectedValue(new ApiError("transport"));
    const remove = vi.spyOn(chatApi, "deleteMessage").mockResolvedValue(undefined);
    await expect(report({ kind: "message", id: 12, senderName: "anna", deletes: true }, "Spam")).rejects.toThrow(ApiError);
    expect(remove).not.toHaveBeenCalled();
  });

  it("doesn't report if blocking failed", async () => {
    vi.spyOn(friendApi, "block").mockRejectedValue(new ApiError("transport"));
    const send = vi.spyOn(reportApi, "report").mockResolvedValue(undefined);
    await expect(report({ kind: "user", id: 7, username: "anna", blocks: true }, "Spam")).rejects.toThrow(ApiError);
    expect(send).not.toHaveBeenCalled();
  });
});
