// Port of ios/Gym 2.0/Core/Persistence/Extensions/Chat+Helpers.swift

import type { Chat, ChatMember, Message, User } from "@/types/models";

type ChatWithMembers = Chat & { members: readonly ChatMember[] };

/** For sorting the chat list, the newest first */
export function chatLastActivity(chat: Chat): Date {
  return chat.latestMessageTimestamp ?? chat.createdAt;
}

export function otherMemberId(chat: ChatWithMembers, currentUserId: number | null): number | null {
  if (chat.groupChat) return null;
  return chat.members.find((member) => member.userId !== currentUserId)?.userId ?? null;
}

/** The group name, or the username of the other member of a direct chat */
export function chatTitle(chat: ChatWithMembers, users: ReadonlyMap<number, User>, currentUserId: number | null): string {
  if (chat.groupChat) return chat.name ?? "Group";
  const otherId = otherMemberId(chat, currentUserId);
  if (otherId === null) return "Chat";
  return users.get(otherId)?.username ?? "Unknown user";
}

/** Direct chats with a blocked user are hidden. They stay on the server and come back once the user is unblocked. */
export function isChatHidden(chat: ChatWithMembers, users: ReadonlyMap<number, User>, currentUserId: number | null): boolean {
  const otherId = otherMemberId(chat, currentUserId);
  if (otherId === null) return false;
  return users.get(otherId)?.isBlocked ?? false;
}

/**
 * The server only accepts messages in a direct chat while both users are friends and neither blocked the other.
 * Null if messages can be sent, otherwise the reason to show instead of the input field.
 */
export function sendingBlockedReason(
  chat: ChatWithMembers,
  users: ReadonlyMap<number, User>,
  currentUserId: number | null,
): string | null {
  const otherId = otherMemberId(chat, currentUserId);
  if (otherId === null) return null;
  const other = users.get(otherId);
  if (!other) {
    // Friends are always stored, but before the first user sync none are known yet
    if (currentUserId === null || !users.has(currentUserId)) return null;
    return "You can only send messages to friends.";
  }
  if (other.isBlocked) return `You blocked ${other.username}. Unblock them in the settings to send messages.`;
  if (!other.isFriend) return "You can only send messages to friends.";
  return null;
}

export function sortMessages(messages: readonly Message[]): Message[] {
  return [...messages].sort((a, b) => a.serverId - b.serverId);
}
