import { describe, expect, it } from "vitest";

import { makeChat, makeMembers, makeUser } from "@/test/fixtures";
import type { Message, User } from "@/types/models";
import { chatLastActivity, chatTitle, isChatHidden, otherMemberId, sendingBlockedReason, sortMessages } from "./chat";

const ME = 42;
const direct = { ...makeChat(), members: makeMembers(7, [ME, 9]) };
const group = { ...makeChat({ groupChat: true, name: "Leg Day Crew" }), members: makeMembers(7, [ME, 9, 10]) };
const usersWith = (...users: User[]) => new Map(users.map((user) => [user.serverId, user]));
const me = makeUser({ serverId: ME, username: "me", isCurrentUser: true });

describe("chat titles", () => {
  it("uses the group name, or Group without one", () => {
    expect(chatTitle(group, usersWith(), ME)).toBe("Leg Day Crew");
    expect(chatTitle({ ...group, name: null }, usersWith(), ME)).toBe("Group");
  });

  it("uses the username of the other member of a direct chat", () => {
    expect(chatTitle(direct, usersWith(me, makeUser({ serverId: 9, username: "anna" })), ME)).toBe("anna");
    expect(chatTitle(direct, usersWith(me), ME)).toBe("Unknown user");
    expect(chatTitle({ ...direct, members: makeMembers(7, [ME]) }, usersWith(me), ME)).toBe("Chat");
  });
});

describe("otherMemberId", () => {
  it("is the other member of a direct chat only", () => {
    expect(otherMemberId(direct, ME)).toBe(9);
    expect(otherMemberId(group, ME)).toBeNull();
    // before the current user is known the first member counts
    expect(otherMemberId(direct, null)).toBe(ME);
  });
});

describe("isChatHidden", () => {
  it("hides direct chats with blocked users only", () => {
    expect(isChatHidden(direct, usersWith(makeUser({ serverId: 9, isBlocked: true })), ME)).toBe(true);
    expect(isChatHidden(direct, usersWith(makeUser({ serverId: 9 })), ME)).toBe(false);
    expect(isChatHidden(direct, usersWith(), ME)).toBe(false);
    expect(isChatHidden(group, usersWith(makeUser({ serverId: 9, isBlocked: true })), ME)).toBe(false);
  });
});

describe("sendingBlockedReason", () => {
  it("allows messages to friends and in groups", () => {
    expect(sendingBlockedReason(direct, usersWith(me, makeUser({ serverId: 9, isFriend: true })), ME)).toBeNull();
    expect(sendingBlockedReason(group, usersWith(me), ME)).toBeNull();
  });

  it("explains why a direct chat can't be written to", () => {
    expect(sendingBlockedReason(direct, usersWith(me, makeUser({ serverId: 9, username: "anna", isBlocked: true })), ME)).toBe(
      "You blocked anna. Unblock them in the settings to send messages.",
    );
    expect(sendingBlockedReason(direct, usersWith(me, makeUser({ serverId: 9 })), ME)).toBe("You can only send messages to friends.");
    // friends are always stored: an unknown user isn't one
    expect(sendingBlockedReason(direct, usersWith(me), ME)).toBe("You can only send messages to friends.");
  });

  it("doesn't block before the first user sync", () => {
    expect(sendingBlockedReason(direct, usersWith(), ME)).toBeNull();
    expect(sendingBlockedReason(direct, usersWith(), null)).toBeNull();
  });
});

describe("ordering", () => {
  it("sorts by the latest message, else the creation", () => {
    const created = new Date(2026, 9, 1);
    const latest = new Date(2026, 9, 5);
    expect(chatLastActivity(makeChat({ createdAt: created }))).toBe(created);
    expect(chatLastActivity(makeChat({ createdAt: created, latestMessageTimestamp: latest }))).toBe(latest);
  });

  it("sorts messages by server id without changing the list", () => {
    const message = (serverId: number): Message => ({ serverId, chatId: 7, senderId: 9, createdAt: new Date(), content: "", imageUrl: null });
    const messages = [message(3), message(1), message(2)];
    expect(sortMessages(messages).map((m) => m.serverId)).toEqual([1, 2, 3]);
    expect(messages.map((m) => m.serverId)).toEqual([3, 1, 2]);
  });
});
