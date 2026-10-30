import type { ChatWithMembers, Message, User } from "@/types/models";

// MARK: - Chat

export type MessageMenuAction = "copy" | "delete" | "deleteAndReport" | "report";

/**
 * The menu of a message: copy for every message with text, delete for the own ones, report for the ones of others.
 * Admins of a group can also delete the messages of others, and delete and report them.
 */
export function messageMenuActions(message: Message, currentUserId: number | null, isAdmin: boolean): MessageMenuAction[] {
  const isOwn = message.senderId === currentUserId;
  const actions: MessageMenuAction[] = [];
  if (message.content !== null) actions.push("copy");
  if (isOwn || isAdmin) actions.push("delete");
  if (!isOwn && isAdmin) actions.push("deleteAndReport");
  if (!isOwn) actions.push("report");
  return actions;
}

// MARK: - Chat info

/** The friends that aren't members of the chat yet, in the order of `friends` */
export function addableFriends(chat: ChatWithMembers, friends: readonly User[]): User[] {
  const memberIds = new Set(chat.members.map((member) => member.userId));
  return friends.filter((friend) => !memberIds.has(friend.serverId));
}

/** The ids of the selected candidates, in the order of the candidates */
export function selectedIdsInOrder(candidates: readonly User[], selectedIds: ReadonlySet<number>): number[] {
  return candidates.map((friend) => friend.serverId).filter((id) => selectedIds.has(id));
}

// MARK: - Friends

/** What the row of the found user shows instead of the "Add" button, or "add" for the button */
export type FoundUserStatus = "you" | "friends" | "blocked" | "busy" | "requested" | "add";

/**
 * The state of the user found by the search: the stored user tells whether it's the current user, a friend or a
 * blocked user, otherwise a running action shows a spinner, a sent request can be cancelled and anyone else added.
 */
export function foundUserStatus(
  stored: Pick<User, "isCurrentUser" | "isFriend" | "isBlocked"> | undefined,
  isBusy: boolean,
  isRequested: boolean,
): FoundUserStatus {
  if (stored?.isCurrentUser) return "you";
  if (stored?.isFriend) return "friends";
  if (stored?.isBlocked) return "blocked";
  if (isBusy) return "busy";
  if (isRequested) return "requested";
  return "add";
}

/**
 * The message below the search field when the lookup failed: not found for 404, 403 (one of the two blocked the
 * other) and 422 (not a valid username), the error itself otherwise.
 */
export function friendSearchFailure(status: number | null, errorMessage: string): string {
  if (status === 404 || status === 403 || status === 422) return "No user found with that username.";
  return errorMessage;
}
