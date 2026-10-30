// Port of ios/Gym 2.0/Core/Services/ChatService.swift

import { formData, send, sendVoid, type ImageUpload } from "../client";
import type { ChatDTO, ChatDeltaDTO, ChatListDTO, MessageDTO, UUIDString } from "../dto";

export const chatApi = {
  /** All chats with all messages, for the first sync. Use `changes()` with the returned sync time afterwards. */
  all: () => send<ChatListDTO>({ method: "GET", path: "/chats" }),

  /**
   * The chats with new messages or new metadata since the sync time of the previous `all()` or `changes()`, and the
   * read state of all chats.
   */
  changes: (syncTime: string) =>
    send<ChatDeltaDTO>({ method: "GET", path: "/chats/delta", query: { last_sync_time: syncTime } }),

  /** Starts a direct chat with a friend. If there already is one, that chat is returned. */
  createDirectChat: (userId: number) => send<ChatDTO>({ method: "POST", path: "/chats", json: { userId } }),

  /** Creates a group chat with the current user and the given friends. A public group can be created without them. */
  createGroupChat: (name: string, memberIds: number[], isPublic = false, image?: ImageUpload | null) =>
    send<ChatDTO>({
      method: "POST",
      path: "/chats/groups",
      form: formData({ name, user_ids: memberIds, public: isPublic }, { image }),
    }),

  /** Changes the name and/or image of a group chat. Only its admins can do this. Null leaves a field unchanged. */
  updateGroupChat: (id: number, name?: string | null, image?: ImageUpload | null) =>
    send<ChatDTO>({ method: "PATCH", path: `/chats/${id}`, form: formData({ name }, { image }) }),

  deleteGroupChatImage: (id: number) => send<ChatDTO>({ method: "DELETE", path: `/chats/${id}/image` }),

  /** Adds friends to a private group chat. Only its admins can do this, users that already are members are skipped. */
  addMembers: (chatId: number, userIds: number[]) =>
    send<ChatDTO>({ method: "POST", path: `/chats/${chatId}/members`, json: { userIds } }),

  /**
   * Removes a member from a private group chat. Only its admins can do this. With the current user's own id it leaves
   * the group, which also works for public groups. When the last admin leaves, a random other member becomes admin.
   * A group without members is deleted.
   */
  removeMember: (userId: number, chatId: number) =>
    sendVoid({ method: "DELETE", path: `/chats/${chatId}/members/${userId}` }),

  /**
   * Makes a member of a group chat an admin or removes their admin status. Only its admins can do this, the last admin
   * can't remove their own admin status.
   */
  setAdmin: (isAdmin: boolean, userId: number, chatId: number) =>
    send<ChatDTO>({ method: "PATCH", path: `/chats/${chatId}/members/${userId}`, json: { admin: isAdmin } }),

  /** Deletes a chat for all members. Both members of a direct chat can do this, a group only its admins. */
  deleteChat: (id: number) => sendVoid({ method: "DELETE", path: `/chats/${id}` }),

  setPublic: (isPublic: boolean, chatId: number) =>
    send<ChatDTO>({ method: "PATCH", path: `/chats/${chatId}/visibility`, json: { public: isPublic } }),

  /** All public group chats with their members, but without messages. */
  publicChats: () => send<ChatDTO[]>({ method: "GET", path: "/chats/public" }),

  /** Joins a public group chat and returns it with all its messages. If already a member, it is returned unchanged. */
  join: (chatId: number) => send<ChatDTO>({ method: "POST", path: `/chats/${chatId}/members/me` }),

  /**
   * Sends text and/or a photo. At least one of them is required, the text can be up to 10'000 characters. If a
   * message with the client UUID was already sent, that message is returned instead of sending it again.
   */
  sendMessage: (chatId: number, options: { text?: string | null; image?: ImageUpload | null; clientUuid?: UUIDString | null }) =>
    send<MessageDTO>({
      method: "POST",
      path: `/chats/${chatId}/messages`,
      form: formData({ client_uuid: options.clientUuid, content: options.text }, { image: options.image }),
    }),

  /**
   * Deletes a message the current user sent (soft delete on the server). The other members' apps remove it with their
   * next delta. 404 if it doesn't exist or is already deleted, 403 for a message of another user.
   */
  deleteMessage: (messageId: number) => sendVoid({ method: "DELETE", path: `/chats/messages/${messageId}` }),

  /** Marks all messages up to the given one as read. The read state only moves forward. */
  markRead: (chatId: number, messageId: number) =>
    sendVoid({ method: "PUT", path: `/chats/${chatId}/read-marker`, json: { messageId } }),
};
