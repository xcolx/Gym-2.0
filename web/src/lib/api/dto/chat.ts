// Mirrors ios/Gym 2.0/Core/Networking/DTOs/ChatDTOs.swift and backend/app/schemas/chat.py
//
// Swift renames `group_chat` to `isGroupChat` and `public` to `isPublic`, here they keep their wire names
// (`groupChat`, `public`). The local Chat model uses `groupChat` and `isPublic` like VersionedSchemaV3.

import type { ISODateString } from "./common";

export interface ChatDTO {
  id: number;
  groupChat: boolean;
  /** Always null for direct chats. */
  name: string | null;
  /** Image hash, served by GET /images/{hash}. */
  imageUrl: string | null;
  createdAt: ISODateString;
  createdBy: number | null;
  /** Public group chats can be found and joined by every user. */
  public: boolean;
  latestMessageTimestamp: ISODateString | null;
  /** At most 50 characters. */
  latestMessagePreview: string | null;
  latestMessageSenderId: number | null;
  members: ChatMemberDTO[];
  /** Ordered from oldest to newest. In a delta only the new messages, in the public chat list none. */
  messages: MessageDTO[];
}

export interface ChatMemberDTO {
  userId: number;
  /** The newest message this member has read, 0 if none. */
  lastReadMessageId: number;
  /**
   * Whether the member is an admin of the group, null for direct chats. Admins can rename the group, change its image,
   * make it public or private, add and remove members, make other members admins and delete it.
   */
  admin: boolean | null;
}

export interface MessageDTO {
  id: number;
  chatId: number;
  /** Null if the sender's account no longer exists. */
  senderId: number | null;
  createdAt: ISODateString;
  /** Null for photo-only messages. */
  content: string | null;
  /** Image hash of the attached photo, served by GET /images/{hash}. */
  imageUrl: string | null;
  /**
   * Set if the sender deleted the message: it comes without text and photo, only in a delta (and as the answer to a
   * repeated send), and has to be removed. The full chat list leaves deleted messages out.
   */
  deletedAt?: ISODateString | null;
}

export interface ChatReadStateDTO {
  chatId: number;
  members: ChatMemberDTO[];
}

export interface ChatListDTO {
  /** All chats of the current user with all their messages. */
  chats: ChatDTO[];
  /** Pass to `chatApi.changes()` for the next sync. Kept as the server sent it to not lose precision. */
  syncTime: string;
}

/** Treat every chat as an upsert and skip messages you already have, because a change can be delivered more than once. */
export interface ChatDeltaDTO {
  /**
   * Chats that are new, renamed, have a new image, were made public or private, have new messages or the user was
   * added to. Each has its current metadata and members, but only the messages sent since the last sync, except the
   * chats the user was added to, which have all their messages.
   */
  chats: ChatDTO[];
  /** The members and read state of every chat of the user. Read state changes have no timestamps, so they are always sent. */
  readStates: ChatReadStateDTO[];
  syncTime: string;
}
