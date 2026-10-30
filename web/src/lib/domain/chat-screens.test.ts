import { describe, expect, it } from "vitest";

import { makeUser } from "@/test/fixtures";
import type { ChatWithMembers, Message } from "@/types/models";
import { addableFriends, foundUserStatus, friendSearchFailure, messageMenuActions, selectedIdsInOrder } from "./chat-screens";

const ME = 1;

function message(senderId: number | null, content: string | null = "hi"): Message {
  return { serverId: 5, chatId: 10, senderId, createdAt: new Date(2026, 9, 1), content, imageUrl: null };
}

describe("messageMenuActions", () => {
  it("lets the sender copy and delete an own message", () => {
    expect(messageMenuActions(message(ME), ME, false)).toEqual(["copy", "delete"]);
  });

  it("lets others copy and report a message", () => {
    expect(messageMenuActions(message(2), ME, false)).toEqual(["copy", "report"]);
  });

  it("lets admins delete and report the messages of others", () => {
    expect(messageMenuActions(message(2), ME, true)).toEqual(["copy", "delete", "deleteAndReport", "report"]);
    expect(messageMenuActions(message(ME), ME, true)).toEqual(["copy", "delete"]);
  });

  it("has no copy for a photo without text, and treats a deleted sender as someone else", () => {
    expect(messageMenuActions(message(ME, null), ME, false)).toEqual(["delete"]);
    expect(messageMenuActions(message(null), ME, false)).toEqual(["copy", "report"]);
  });
});

describe("addableFriends and selectedIdsInOrder", () => {
  const chat = {
    members: [
      { chatId: 10, userId: ME, lastReadMessageId: 0, admin: true },
      { chatId: 10, userId: 2, lastReadMessageId: 0, admin: false },
    ],
  } as ChatWithMembers;
  const friends = [makeUser({ serverId: 4 }), makeUser({ serverId: 2 }), makeUser({ serverId: 3 })];

  it("leaves out the friends that are members already", () => {
    expect(addableFriends(chat, friends).map((friend) => friend.serverId)).toEqual([4, 3]);
  });

  it("returns the selected ids in the order of the candidates", () => {
    const candidates = addableFriends(chat, friends);
    expect(selectedIdsInOrder(candidates, new Set([3, 4, 99]))).toEqual([4, 3]);
    expect(selectedIdsInOrder(candidates, new Set())).toEqual([]);
  });
});

describe("foundUserStatus", () => {
  const flags = { isCurrentUser: false, isFriend: false, isBlocked: false };

  it("uses the stored user first", () => {
    expect(foundUserStatus({ ...flags, isCurrentUser: true }, true, true)).toBe("you");
    expect(foundUserStatus({ ...flags, isFriend: true }, true, true)).toBe("friends");
    expect(foundUserStatus({ ...flags, isBlocked: true }, true, true)).toBe("blocked");
  });

  it("shows a running action, a sent request or the add button", () => {
    expect(foundUserStatus(undefined, true, true)).toBe("busy");
    expect(foundUserStatus(flags, false, true)).toBe("requested");
    expect(foundUserStatus(undefined, false, false)).toBe("add");
  });
});

describe("friendSearchFailure", () => {
  it("says that no user was found for 403, 404 and 422", () => {
    for (const status of [403, 404, 422]) expect(friendSearchFailure(status, "x")).toBe("No user found with that username.");
  });

  it("shows other errors", () => {
    expect(friendSearchFailure(500, "Server error")).toBe("Server error");
    expect(friendSearchFailure(null, "Offline")).toBe("Offline");
  });
});
