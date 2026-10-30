import Dexie from "dexie";

import { useSession } from "@/lib/auth/session";
import type { GymDB } from "@/lib/db";
import { isChatHidden } from "@/lib/domain/chat";
import type { ChatWithMembers } from "@/types/models";
import { useCurrentUser, useDbQuery } from "./hooks";
import { chatsWithMembers } from "./queries";

/**
 * The server id of the logged-in user (`currentUsers.first?.serverId ?? authService.currentUser?.id`): from the
 * stored current user, or from the session before the first sync stored it. Null while unknown.
 */
export function useCurrentUserId(): number | null {
  const user = useCurrentUser();
  const session = useSession();
  return user?.serverId ?? session.userId ?? null;
}

/** The messages of others in the chat the user hasn't read yet (`Chat.unreadCount`), counted in the database */
export async function unreadCountIn(db: GymDB, chat: ChatWithMembers, currentUserId: number | null): Promise<number> {
  if (currentUserId === null) return 0;
  const member = chat.members.find((m) => m.userId === currentUserId);
  if (!member) return 0;
  return db.messages
    .where("[chatId+serverId]")
    .between([chat.serverId, member.lastReadMessageId], [chat.serverId, Dexie.maxKey], false, true)
    .filter((message) => message.senderId !== currentUserId)
    .count();
}

export interface ChatListItem {
  chat: ChatWithMembers;
  unread: number;
}

/** The chats of the list: without the hidden direct chats with blocked users, the most recently active first */
export function useChatList(currentUserId: number | null): ChatListItem[] | undefined {
  return useDbQuery(
    async (db) => {
      const [chats, users] = await Promise.all([chatsWithMembers(db), db.users.toArray()]);
      const usersById = new Map(users.map((user) => [user.serverId, user]));
      const visible = chats.filter((chat) => !isChatHidden(chat, usersById, currentUserId));
      return Promise.all(visible.map(async (chat) => ({ chat, unread: await unreadCountIn(db, chat, currentUserId) })));
    },
    [currentUserId],
  );
}

/** The server ids of the stored chats, e.g. to show which public groups the user joined */
export function useChatIds(): Set<number> | undefined {
  return useDbQuery(async (db) => new Set(await db.chats.toCollection().primaryKeys()));
}
