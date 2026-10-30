// The online actions of the chat tab and the blocked users (FriendActions.swift and the actions of ChatInfoView,
// NewGroupChatView and PublicGroupsView): the API is called first and the result is stored locally afterwards.
// Outside of lib/repo, since they sync afterwards through the sync engine, which itself builds on lib/repo.

import { chatApi, errorStatus, friendApi, reportApi, type ChatDTO, type ImageUpload, type UserDTO } from "@/lib/api";
import type { ReportTarget } from "@/lib/domain/chat-feature";
import { deleteChatLocally, deleteMessageLocally, removeChatMemberLocally } from "@/lib/repo/chats";
import { storeUser, updateStoredUser } from "@/lib/repo/user";
import { storeChatAndMembers, sync } from "@/lib/sync/engine";

/**
 * `FriendActions.didChange`: the stored users were updated right away, so the lists change without waiting, and the
 * sync then loads the friends and blocked users from the server again.
 */
function didChange(): void {
  void sync();
}

// MARK: - Friends (FriendActions.swift)

/**
 * Sends a friend request. Returns the server's message, e.g. that the request was sent or that the user's own request
 * was accepted.
 */
export async function sendFriendRequest(userId: number): Promise<string> {
  const result = await friendApi.sendFriendRequest(userId);
  didChange();
  return result.message ?? "Friend request sent.";
}

/** Cancels the request the current user sent to the user */
export async function cancelFriendRequest(userId: number): Promise<void> {
  try {
    await friendApi.deleteFriendRequest(userId);
  } catch (error) {
    // Already answered, e.g. accepted in the meantime
    if (errorStatus(error) !== 404) throw error;
  }
  didChange();
}

export async function answerFriendRequest(sender: UserDTO, accept: boolean): Promise<void> {
  const result = await friendApi.answerFriendRequest(sender.id, accept);
  if (result.newFriend) await storeUser(result.newFriend, { isFriend: true });
  didChange();
}

export async function removeFriend(userId: number): Promise<void> {
  try {
    await friendApi.removeFriend(userId);
  } catch (error) {
    // Already removed, e.g. by the other user
    if (errorStatus(error) !== 404) throw error;
  }
  await updateStoredUser(userId, { isFriend: false });
  didChange();
}

/**
 * Blocking also removes the friendship. The direct chat is hidden until the user is unblocked. `profile` stores a user
 * that isn't stored yet, e.g. the sender of a friend request.
 */
export async function blockUser(userId: number, options: { profile?: UserDTO | null } = {}): Promise<void> {
  await friendApi.block(userId);
  const changes = { isBlocked: true, isFriend: false };
  if (options.profile) await storeUser(options.profile, changes);
  else await updateStoredUser(userId, changes);
  didChange();
}

/**
 * Reports a user, group chat or message (ReportAlert.send). A user with `blocks` is blocked first with `block`, so the
 * screen can update itself like after a plain block. A message with `deletes` is deleted afterwards, since deleted
 * messages can't be reported (the report keeps a copy of its text and photo).
 */
export async function report(
  target: ReportTarget,
  reason: string,
  block: (id: number, profile: UserDTO | null) => Promise<void> = (id, profile) => blockUser(id, { profile }),
): Promise<void> {
  if (target.kind === "user" && target.blocks) await block(target.id, target.profile ?? null);
  const ids =
    target.kind === "user"
      ? { reportedUserId: target.id }
      : target.kind === "chat"
        ? { reportedChatId: target.id }
        : { reportedMessageId: target.id };
  await reportApi.report(ids, reason);
  if (target.kind === "message" && target.deletes) await deleteMessage(target.id);
}

/** BlockedUsersView.unblock. The next pull removes the user if they're not a friend or in a chat anymore. */
export async function unblockUser(userId: number): Promise<void> {
  try {
    await friendApi.unblock(userId);
  } catch (error) {
    // Already unblocked, e.g. on another device
    if (errorStatus(error) !== 404) throw error;
  }
  await updateStoredUser(userId, { isBlocked: false });
}

/** The direct chat with the friend, created if there is none yet. Returns its server id. */
export async function openDirectChat(friendId: number): Promise<number> {
  const dto = await chatApi.createDirectChat(friendId);
  await storeChatAndMembers(dto);
  return dto.id;
}

// MARK: - Groups (NewGroupChatView, ChatInfoView, PublicGroupsView)

/** Creates a group with the current user and the friends. Returns its server id. */
export async function createGroupChat(
  name: string,
  memberIds: number[],
  isPublic: boolean,
  image: ImageUpload | null,
): Promise<number> {
  const dto = await chatApi.createGroupChat(name, memberIds, isPublic, image);
  await storeChatAndMembers(dto);
  return dto.id;
}

/** Changes the name and/or image of a group. Returns the server's chat. */
export async function updateGroupChat(chatId: number, name: string | null, image: ImageUpload | null): Promise<ChatDTO> {
  const dto = await chatApi.updateGroupChat(chatId, name, image);
  await storeChatAndMembers(dto);
  return dto;
}

/** Removes the image of a group. Returns the server's chat. */
export async function removeGroupChatImage(chatId: number): Promise<ChatDTO> {
  const dto = await chatApi.deleteGroupChatImage(chatId);
  await storeChatAndMembers(dto);
  return dto;
}

export async function setGroupPublic(chatId: number, isPublic: boolean): Promise<void> {
  await storeChatAndMembers(await chatApi.setPublic(isPublic, chatId));
}

export async function setGroupAdmin(chatId: number, userId: number, isAdmin: boolean): Promise<void> {
  await storeChatAndMembers(await chatApi.setAdmin(isAdmin, userId, chatId));
}

export async function addGroupMembers(chatId: number, userIds: number[]): Promise<void> {
  await storeChatAndMembers(await chatApi.addMembers(chatId, userIds));
}

/** Removes a member right away, the next sync brings the server's members */
export async function removeGroupMember(chatId: number, userId: number): Promise<void> {
  try {
    await chatApi.removeMember(userId, chatId);
  } catch (error) {
    // Already removed, e.g. by another member
    if (errorStatus(error) !== 404) throw error;
  }
  await removeChatMemberLocally(chatId, userId);
}

/** Leaves a group (a group without members is deleted by the server) and removes it locally */
export async function leaveGroup(chatId: number, currentUserId: number): Promise<void> {
  try {
    await chatApi.removeMember(currentUserId, chatId);
  } catch (error) {
    // Already removed, e.g. by another member
    const status = errorStatus(error);
    if (status !== 404 && status !== 403) throw error;
  }
  await deleteChatLocally(chatId);
}

/** Deletes a chat for all members and removes it locally */
export async function deleteChat(chatId: number): Promise<void> {
  try {
    await chatApi.deleteChat(chatId);
  } catch (error) {
    // Already deleted, e.g. by the other member
    if (errorStatus(error) !== 404) throw error;
  }
  await deleteChatLocally(chatId);
}

/** Joins a public group and stores it with all its messages. Returns its server id. */
export async function joinPublicGroup(chatId: number): Promise<number> {
  const dto = await chatApi.join(chatId);
  await storeChatAndMembers(dto);
  return dto.id;
}

// MARK: - Messages

/**
 * Deletes a message the current user sent (or, as an admin, a message of another member of a group) for everyone in
 * the chat and removes it locally. The chat's preview of the latest message is updated by the next pull.
 */
export async function deleteMessage(messageId: number): Promise<void> {
  try {
    await chatApi.deleteMessage(messageId);
  } catch (error) {
    // Already deleted, e.g. on another device
    if (errorStatus(error) !== 404) throw error;
  }
  await deleteMessageLocally(messageId);
}
