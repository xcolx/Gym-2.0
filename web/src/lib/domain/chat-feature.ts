// The pure parts of the chat screens of ios/Gym 2.0/Features/Chat. `users` are all users the app knows by server id
// (`useUsersById()` in lib/repo).

import type { ChatDTO, UserDTO } from "@/lib/api/dto";
import type { Chat, ChatMember, ChatWithMembers, Message, User } from "@/types/models";
import { appLocale, characterCount, prefixCharacters, timeFromDate } from "./format";

/** ChatView.maxMessageLength, the backend's limit of a message (and of a photo caption) */
export const MAX_MESSAGE_LENGTH = 10_000;
/** NewGroupChatView.maxNameLength */
const MAX_GROUP_NAME_LENGTH = 25;
/** ReportAlert.maxReasonLength, like the backend */
export const MAX_REPORT_REASON_LENGTH = 500;
/** The server's `latest_message_preview` is at most 50 characters */
export const MAX_PREVIEW_LENGTH = 50;
/** The server's preview of a photo without caption (ChatSync.sendPhoto) */
export const PHOTO_PREVIEW = "📷 Photo";

// MARK: - Chat list (ChatRowView)

/** The preview of the latest message, with the sender in groups and "You: " for the user's own messages */
export function chatPreview(chat: Chat, users: ReadonlyMap<number, User>, currentUserId: number | null): string | null {
  const text = chat.latestMessagePreview;
  if (text === null) return null;
  const senderId = chat.latestMessageSenderId;
  if (!(chat.groupChat || senderId === currentUserId) || senderId === null) return text;
  const sender = senderId === currentUserId ? "You" : (users.get(senderId)?.username ?? "Unknown");
  return `${sender}: ${text}`;
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** The time for today, the day and month otherwise (`.dateTime.hour().minute()` / `.dateTime.day().month()`) */
export function formatChatListDate(date: Date, now: Date = new Date(), locale: string = appLocale()): string {
  if (isSameDay(date, now)) return formatMessageTime(date, locale);
  return date.toLocaleDateString(locale, { day: "numeric", month: "short" });
}

/** `.dateTime.hour().minute()` */
export function formatMessageTime(date: Date, locale: string = appLocale()): string {
  // Like iOS: "08:05" with a 24-hour clock, "8:05 AM" with a 12-hour clock
  const { hourCycle } = new Intl.DateTimeFormat(locale, { hour: "numeric" }).resolvedOptions();
  const twentyFourHours = hourCycle === "h23" || hourCycle === "h24";
  return date.toLocaleTimeString(locale, { hour: twentyFourHours ? "2-digit" : "numeric", minute: "2-digit" });
}

/** The day above the first message of a day (`.dateTime.weekday(.wide).day().month(.wide)`) */
export function formatDaySeparator(date: Date, locale: string = appLocale()): string {
  return date.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });
}

/** The date of an AI message: the time for today (`timeFromDate`), otherwise the day, month and time */
export function formatAIMessageDate(date: Date, now: Date = new Date(), locale: string = appLocale()): string {
  if (isSameDay(date, now)) return timeFromDate(date);
  return date.toLocaleString(locale, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

// MARK: - Messages (ChatView)

interface MessageRow {
  message: Message;
  /** The day shown above the message, for the first message of a day */
  daySeparator: Date | null;
  isOwn: boolean;
  /** The sender's name above the first of their messages in a row in groups, null otherwise */
  senderName: string | null;
}

/** The messages (sorted from oldest to newest) with what ChatView shows around each */
export function messageRows(
  messages: readonly Message[],
  chat: Chat,
  users: ReadonlyMap<number, User>,
  currentUserId: number | null,
): MessageRow[] {
  return messages.map((message, index) => {
    const previous = index > 0 ? messages[index - 1] : null;
    const previousSenderId = previous ? previous.senderId : null;
    const isOwn = message.senderId === currentUserId;
    const showsSender = chat.groupChat && !isOwn && previousSenderId !== message.senderId;
    return {
      message,
      daySeparator: previous === null || !isSameDay(previous.createdAt, message.createdAt) ? message.createdAt : null,
      isOwn,
      senderName: showsSender
        ? ((message.senderId === null ? undefined : users.get(message.senderId)?.username) ?? "Unknown user")
        : null,
    };
  });
}

/** Whether the text can be sent: not empty, not too long and no other text is being sent or waiting */
export function canSendText(draft: string, options: { isSending: boolean; isPending: boolean }): boolean {
  const text = draft.trim();
  return text !== "" && characterCount(text) <= MAX_MESSAGE_LENGTH && !options.isSending && !options.isPending;
}

// MARK: - Chat info (ChatInfoView)

/**
 * Only admins can rename a group, change its image, make it public or private, add and remove members, make other
 * members admins and delete it
 */
export function isChatAdmin(chat: ChatWithMembers, currentUserId: number | null): boolean {
  return chat.groupChat && chat.members.some((member) => member.userId === currentUserId && member.admin === true);
}

/** The members to show: the current user first, then by username. A direct chat only shows the other member. */
export function sortedChatMembers(
  chat: ChatWithMembers,
  users: ReadonlyMap<number, User>,
  currentUserId: number | null,
): ChatWithMembers["members"] {
  return chat.members
    .filter((member) => chat.groupChat || member.userId !== currentUserId)
    .sort((a, b) => {
      if (a.userId === currentUserId) return -1;
      if (b.userId === currentUserId) return 1;
      const nameA = users.get(a.userId)?.username ?? "";
      const nameB = users.get(b.userId)?.username ?? "";
      return nameA.localeCompare(nameB, undefined, { sensitivity: "base" });
    });
}

/** "Friend", "Blocked", and "Admin" for the admins of a group */
export function memberStatus(chat: Chat, member: ChatMember, user: User | undefined): string | null {
  const relation = user?.isBlocked ? "Blocked" : user?.isFriend ? "Friend" : null;
  if (!(chat.groupChat && member.admin === true)) return relation;
  return relation ? `Admin · ${relation}` : "Admin";
}

/** Admins can remove other members (admins too) from private groups */
export function canRemoveMember(chat: Chat, userId: number, isAdmin: boolean, currentUserId: number | null): boolean {
  return isAdmin && chat.groupChat && !chat.isPublic && userId !== currentUserId;
}

/**
 * Admins can make other members admins and remove their admin status, also their own as long as another admin is left.
 * Returns whether the member would become admin, or null if it can't be changed.
 */
export function adminChange(chat: ChatWithMembers, member: ChatMember, isAdmin: boolean, currentUserId: number | null): boolean | null {
  if (!isAdmin || !chat.groupChat) return null;
  if (member.userId !== currentUserId) return member.admin !== true;
  const otherAdmins = chat.members.filter((other) => other.admin === true && other.userId !== currentUserId);
  return otherAdmins.length > 0 ? false : null;
}

/** The title and message of the confirmation before leaving a group */
export function leaveGroupConfirmation(
  chat: ChatWithMembers,
  currentUserId: number | null,
): { title: string; message: string } {
  const memberCount = chat.members.length;
  const rejoin =
    chat.isPublic || memberCount <= 1
      ? "You can join it again in the public groups, as long as it has members."
      : "Only an admin can add you again.";
  const isOnlyAdmin =
    isChatAdmin(chat, currentUserId) &&
    !chat.members.some((member) => member.admin === true && member.userId !== currentUserId);
  return {
    title: memberCount <= 1 ? "Leave and delete the group?" : "Leave the group?",
    message:
      isOnlyAdmin && memberCount > 1
        ? `${rejoin} You're its only admin, so a random member becomes admin.`
        : rejoin,
  };
}

/** The footer below the name and image of a group */
export function groupFooter(isPublic: boolean): string {
  return isPublic
    ? "Public group: everyone can find and join it. Members can't be added or removed."
    : "Private group: only its members can see it, and its admins can add and remove members.";
}

/** A valid group name: trimmed, not empty and at most 25 characters */
export function isValidGroupName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed !== "" && characterCount(trimmed) <= MAX_GROUP_NAME_LENGTH;
}

// MARK: - Report (ReportAlert)

/** A user, group chat or message to report (ReportTarget of ReportAlert.swift) */
export type ReportTarget =
  /**
   * With `blocks` the user is blocked as well ("Block and Report…"). `profile` is for users that aren't stored yet,
   * e.g. the sender of a friend request.
   */
  | { kind: "user"; id: number; username: string; profile?: UserDTO | null; blocks?: boolean }
  | { kind: "chat"; id: number; name: string }
  /** With `deletes` the message is deleted for everyone after the report ("Delete and Report…", for group admins). */
  | { kind: "message"; id: number; senderName: string | null; deletes?: boolean };

export function reportTitle(target: ReportTarget): string {
  switch (target.kind) {
    case "user":
      return `Report ${target.username}`;
    case "chat":
      return `Report ${target.name}`;
    case "message":
      return target.senderName === null ? "Report Message" : `Report Message from ${target.senderName}`;
  }
}

export function reportMessage(target: ReportTarget): string {
  const reviewed = "The report is reviewed within 24 hours.";
  if (target.kind === "user" && target.blocks) return `They will be blocked as well. ${reviewed}`;
  if (target.kind === "message" && target.deletes) return `It will be deleted for everyone as well. ${reviewed}`;
  return reviewed;
}

/** The reason as it is sent: trimmed and at most 500 characters. Null if it is empty. */
export function reportReason(text: string): string | null {
  const trimmed = text.trim();
  return trimmed === "" ? null : prefixCharacters(trimmed, MAX_REPORT_REASON_LENGTH);
}

// MARK: - Public groups (PublicGroupsView)

/** The most recently active first, filtered by name */
export function filterPublicGroups(groups: readonly ChatDTO[], search: string): ChatDTO[] {
  const activity = (group: ChatDTO) => Date.parse(group.latestMessageTimestamp ?? group.createdAt) || 0;
  const sorted = [...groups].sort((a, b) => activity(b) - activity(a));
  const query = search.trim().toLocaleLowerCase();
  if (query === "") return sorted;
  return sorted.filter((group) => (group.name ?? "").toLocaleLowerCase().includes(query));
}

export function memberCountText(count: number): string {
  return count === 1 ? "1 member" : `${count} members`;
}

/**
 * The warning before joining a public group with members the user blocked, null if there are none. Blocking only
 * hides the direct chat, so in a group both see each other's messages.
 */
export function blockedMembersWarning(group: ChatDTO, blockedUsers: readonly User[]): string | null {
  const memberIds = new Set(group.members.map((member) => member.userId));
  const names = blockedUsers.filter((user) => memberIds.has(user.serverId)).map((user) => user.username);
  if (names.length === 0) return null;
  const list = new Intl.ListFormat("en", { type: "conjunction" }).format(names);
  return `${list}, who you blocked, ${names.length === 1 ? "is a member" : "are members"} of this group. In a group you see each other's messages.`;
}

/** The friends screen loads the friend requests again this often while it is visible (the backend allows 30 a minute) */
export const FRIEND_REQUESTS_REFRESH_MS = 15_000;

/**
 * Whether a sent friend request is gone in the requests loaded again (accepted or declined on the other device), so
 * the friends have to be synced: the new friend appears in the list.
 */
export function sentRequestsAnswered(previousReceiverIds: readonly number[], receiverIds: readonly number[]): boolean {
  const current = new Set(receiverIds);
  return previousReceiverIds.some((id) => !current.has(id));
}

/** The chat routes that poll the chats: the chat list and every chat screen, not the AI chats (server-only data) */
export function pollsChats(pathname: string): boolean {
  return (pathname === "/chat" || pathname.startsWith("/chat/")) && !/^\/chat\/ai(\/|$)/.test(pathname);
}
