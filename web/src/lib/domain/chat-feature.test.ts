import { describe, expect, it } from "vitest";

import type { ChatDTO } from "@/lib/api/dto";
import type { ChatWithMembers, Message, User } from "@/types/models";
import {
  adminChange,
  canRemoveMember,
  canSendText,
  chatPreview,
  blockedMembersWarning,
  filterPublicGroups,
  formatChatListDate,
  isChatAdmin,
  isValidGroupName,
  leaveGroupConfirmation,
  memberStatus,
  messageRows,
  pollsChats,
  reportMessage,
  reportReason,
  reportTitle,
  sentRequestsAnswered,
  sortedChatMembers,
} from "./chat-feature";
import { characterCount, prefixCharacters } from "./format";
import { formatRelativeNamed } from "./relative-date";

const ME = 1;

function user(serverId: number, username: string, flags: Partial<User> = {}): User {
  return {
    serverId,
    syncState: "synced",
    username,
    profileImageUrl: "",
    profileIconUrl: "",
    language: null,
    email: null,
    createdAt: null,
    bodyweight: null,
    schemeColor: null,
    weightUnit: null,
    distanceUnit: null,
    isCurrentUser: serverId === ME,
    isFriend: false,
    isBlocked: false,
    ...flags,
  };
}

function chat(overrides: Partial<ChatWithMembers> = {}): ChatWithMembers {
  return {
    serverId: 10,
    groupChat: true,
    name: "Lifters",
    imageUrl: null,
    createdAt: new Date(2026, 9, 1, 12, 0),
    createdById: 2,
    isPublic: false,
    latestMessageTimestamp: null,
    latestMessagePreview: null,
    latestMessageSenderId: null,
    input: "",
    inputUUID: null,
    members: [
      { chatId: 10, userId: ME, lastReadMessageId: 0, admin: false },
      { chatId: 10, userId: 2, lastReadMessageId: 0, admin: true },
      { chatId: 10, userId: 3, lastReadMessageId: 0, admin: false },
    ],
    ...overrides,
  };
}

function message(serverId: number, senderId: number | null, createdAt: Date): Message {
  return { serverId, chatId: 10, senderId, createdAt, content: `m${serverId}`, imageUrl: null };
}

const users = new Map<number, User>([
  [ME, user(ME, "me")],
  [2, user(2, "bea", { isFriend: true })],
  [3, user(3, "Al", { isBlocked: true })],
]);

describe("chatPreview", () => {
  it("prefixes the sender in groups and the own messages", () => {
    expect(chatPreview(chat({ latestMessagePreview: "hi", latestMessageSenderId: 2 }), users, ME)).toBe("bea: hi");
    expect(chatPreview(chat({ latestMessagePreview: "hi", latestMessageSenderId: 9 }), users, ME)).toBe("Unknown: hi");
    expect(chatPreview(chat({ groupChat: false, latestMessagePreview: "hi", latestMessageSenderId: ME }), users, ME)).toBe(
      "You: hi",
    );
    expect(chatPreview(chat({ groupChat: false, latestMessagePreview: "hi", latestMessageSenderId: 2 }), users, ME)).toBe(
      "hi",
    );
    expect(chatPreview(chat(), users, ME)).toBeNull();
  });
});

describe("messageRows", () => {
  it("shows the day once and the sender above the first of their messages in a row", () => {
    const day1 = new Date(2026, 9, 14, 9, 0);
    const day2 = new Date(2026, 9, 15, 9, 0);
    const rows = messageRows(
      [message(1, 2, day1), message(2, 2, day1), message(3, ME, day1), message(4, 2, day2), message(5, null, day2)],
      chat(),
      users,
      ME,
    );
    expect(rows.map((row) => row.daySeparator)).toEqual([day1, null, null, day2, null]);
    expect(rows.map((row) => row.senderName)).toEqual(["bea", null, null, "bea", "Unknown user"]);
    expect(rows.map((row) => row.isOwn)).toEqual([false, false, true, false, false]);
  });

  it("shows no sender names in direct chats", () => {
    const rows = messageRows([message(1, 2, new Date())], chat({ groupChat: false }), users, ME);
    expect(rows[0].senderName).toBeNull();
  });
});

describe("canSendText", () => {
  it("needs text that isn't too long and nothing waiting", () => {
    expect(canSendText("  hi ", { isSending: false, isPending: false })).toBe(true);
    expect(canSendText("   ", { isSending: false, isPending: false })).toBe(false);
    expect(canSendText("hi", { isSending: true, isPending: false })).toBe(false);
    expect(canSendText("hi", { isSending: false, isPending: true })).toBe(false);
    expect(canSendText("x".repeat(10_001), { isSending: false, isPending: false })).toBe(false);
  });
});

describe("chat info", () => {
  it("sorts the current user first, then by username", () => {
    expect(sortedChatMembers(chat(), users, ME).map((m) => m.userId)).toEqual([ME, 3, 2]);
    const direct = chat({ groupChat: false, members: [{ chatId: 10, userId: ME, lastReadMessageId: 0, admin: null }, { chatId: 10, userId: 2, lastReadMessageId: 0, admin: null }] });
    expect(sortedChatMembers(direct, users, ME).map((m) => m.userId)).toEqual([2]);
  });

  it("describes the members", () => {
    const [me, creator, blocked] = chat().members;
    expect(memberStatus(chat(), creator, users.get(2))).toBe("Admin · Friend");
    expect(memberStatus(chat(), blocked, users.get(3))).toBe("Blocked");
    expect(memberStatus(chat(), { ...blocked, userId: 4, admin: true }, undefined)).toBe("Admin");
    expect(memberStatus(chat(), me, users.get(ME))).toBeNull();
  });

  it("only lets admins change the group", () => {
    expect(isChatAdmin(chat(), ME)).toBe(false);
    expect(isChatAdmin(chat(), 2)).toBe(true);
    expect(isChatAdmin(chat({ groupChat: false }), 2)).toBe(false);
  });

  it("lets admins remove other members of private groups", () => {
    expect(canRemoveMember(chat(), 3, true, ME)).toBe(true);
    expect(canRemoveMember(chat(), 2, true, ME)).toBe(true);
    expect(canRemoveMember(chat(), 3, false, ME)).toBe(false);
    expect(canRemoveMember(chat(), ME, true, ME)).toBe(false);
    expect(canRemoveMember(chat({ isPublic: true }), 3, true, ME)).toBe(false);
    expect(canRemoveMember(chat({ groupChat: false }), 3, true, ME)).toBe(false);
  });

  it("lets admins make members admins and remove it, their own only while another admin is left", () => {
    const [me, creator, other] = chat().members;
    expect(adminChange(chat(), other, true, ME)).toBe(true);
    expect(adminChange(chat(), creator, true, ME)).toBe(false);
    expect(adminChange(chat(), other, false, ME)).toBeNull();
    expect(adminChange(chat(), creator, true, 2)).toBeNull();
    const twoAdmins = chat({ members: [{ ...me, admin: true }, creator, other] });
    expect(adminChange(twoAdmins, { ...me, admin: true }, true, ME)).toBe(false);
  });

  it("explains leaving", () => {
    expect(leaveGroupConfirmation(chat(), ME)).toEqual({
      title: "Leave the group?",
      message: "Only an admin can add you again.",
    });
    expect(leaveGroupConfirmation(chat({ isPublic: true }), 2).message).toBe(
      "You can join it again in the public groups, as long as it has members. You're its only admin, so a random member becomes admin.",
    );
    const alone = chat({ members: [{ chatId: 10, userId: 2, lastReadMessageId: 0, admin: true }] });
    expect(leaveGroupConfirmation(alone, 2)).toEqual({
      title: "Leave and delete the group?",
      message: "You can join it again in the public groups, as long as it has members.",
    });
  });

  it("validates group names", () => {
    expect(isValidGroupName("  Team ")).toBe(true);
    expect(isValidGroupName("   ")).toBe(false);
    expect(isValidGroupName("x".repeat(26))).toBe(false);
  });
});

describe("helpers", () => {
  it("cuts by characters", () => {
    expect(prefixCharacters("💪💪💪", 2)).toBe("💪💪");
    expect(prefixCharacters("abc", 5)).toBe("abc");
    // like Swift's prefix by grapheme clusters, while the limits count unicode scalars like the server
    expect(prefixCharacters("🦵🏽🦵🏽", 1)).toBe("🦵🏽");
    expect(characterCount("🦵🏽")).toBe(2);
  });

  it("trims and limits the report reason", () => {
    expect(reportReason("  spam ")).toBe("spam");
    expect(reportReason("   ")).toBeNull();
    expect(reportReason("x".repeat(600))).toHaveLength(500);
  });

  it("titles and explains the reports of users, groups and messages", () => {
    expect(reportTitle({ kind: "user", id: 7, username: "anna" })).toBe("Report anna");
    expect(reportTitle({ kind: "chat", id: 4, name: "Lifters" })).toBe("Report Lifters");
    expect(reportTitle({ kind: "message", id: 12, senderName: "anna" })).toBe("Report Message from anna");
    expect(reportTitle({ kind: "message", id: 12, senderName: null })).toBe("Report Message");
    expect(reportMessage({ kind: "user", id: 7, username: "anna", blocks: true })).toBe(
      "They will be blocked as well. The report is reviewed within 24 hours.",
    );
    expect(reportMessage({ kind: "chat", id: 4, name: "Lifters" })).toBe("The report is reviewed within 24 hours.");
    expect(reportMessage({ kind: "message", id: 12, senderName: "anna", deletes: true })).toBe(
      "It will be deleted for everyone as well. The report is reviewed within 24 hours.",
    );
  });

  it("formats the list date", () => {
    const now = new Date(2026, 9, 15, 18, 0);
    expect(formatChatListDate(new Date(2026, 9, 15, 8, 5), now, "en-GB")).toBe("08:05");
    expect(formatChatListDate(new Date(2026, 9, 3, 8, 5), now, "en-GB")).toBe("3 Oct");
  });

  it("formats relative dates with names", () => {
    const now = new Date(2026, 9, 15, 18, 0);
    expect(formatRelativeNamed(new Date(2026, 9, 14, 17, 0), now, "en")).toBe("yesterday");
    expect(formatRelativeNamed(new Date(2026, 9, 15, 17, 30), now, "en")).toBe("30 minutes ago");
    expect(formatRelativeNamed(now, now, "en")).toBe("now");
  });

  it("sorts and filters the public groups", () => {
    const group = (id: number, name: string, latest: string | null): ChatDTO => ({
      id,
      groupChat: true,
      name,
      imageUrl: null,
      createdAt: "2026-10-01T10:00:00+00:00",
      createdBy: 1,
      public: true,
      latestMessageTimestamp: latest,
      latestMessagePreview: null,
      latestMessageSenderId: null,
      members: [],
      messages: [],
    });
    const groups = [group(1, "Runners", null), group(2, "Lifters", "2026-10-10T10:00:00+00:00"), group(3, "Climbers", "2026-10-05T10:00:00+00:00")];
    expect(filterPublicGroups(groups, "").map((g) => g.id)).toEqual([2, 3, 1]);
    expect(filterPublicGroups(groups, " ers ").map((g) => g.id)).toEqual([2, 3, 1]);
    expect(filterPublicGroups(groups, "LIFT").map((g) => g.id)).toEqual([2]);
  });

  it("warns about blocked members of a public group", () => {
    const group = (memberIds: number[]): ChatDTO => ({
      id: 1,
      groupChat: true,
      name: "Lifters",
      imageUrl: null,
      createdAt: "2026-10-01T10:00:00+00:00",
      createdBy: 2,
      public: true,
      latestMessageTimestamp: null,
      latestMessagePreview: null,
      latestMessageSenderId: null,
      members: memberIds.map((userId) => ({ userId, lastReadMessageId: 0, admin: null })),
      messages: [],
    });
    const blocked = [user(2, "anna", { isBlocked: true }), user(3, "ben", { isBlocked: true }), user(4, "cleo", { isBlocked: true })];
    expect(blockedMembersWarning(group([5, 6]), blocked)).toBeNull();
    expect(blockedMembersWarning(group([2, 5]), [])).toBeNull();
    expect(blockedMembersWarning(group([2, 5]), blocked)).toBe(
      "anna, who you blocked, is a member of this group. In a group you see each other's messages.",
    );
    expect(blockedMembersWarning(group([2, 3, 4]), blocked)).toBe(
      "anna, ben, and cleo, who you blocked, are members of this group. In a group you see each other's messages.",
    );
  });
});

describe("pollsChats", () => {
  it("polls on the chat list and the chat screens, not on the AI chats", () => {
    expect(pollsChats("/chat")).toBe(true);
    expect(pollsChats("/chat/6")).toBe(true);
    expect(pollsChats("/chat/6/info")).toBe(true);
    expect(pollsChats("/chat/friends")).toBe(true);
    expect(pollsChats("/chat/ai")).toBe(false);
    expect(pollsChats("/chat/ai/12")).toBe(false);
    expect(pollsChats("/chatty")).toBe(false);
    expect(pollsChats("/home")).toBe(false);
  });
});

describe("sentRequestsAnswered", () => {
  it("notices a sent request that is gone", () => {
    expect(sentRequestsAnswered([3, 4], [4])).toBe(true);
    expect(sentRequestsAnswered([3], [3, 5])).toBe(false);
    expect(sentRequestsAnswered([], [])).toBe(false);
  });
});
