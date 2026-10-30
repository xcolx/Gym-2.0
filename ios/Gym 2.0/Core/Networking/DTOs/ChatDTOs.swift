//
//  ChatDTOs.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 04.10.2026.
//

import Foundation

// Mirrors backend/app/schemas/chat.py

struct ChatDTO: Decodable, Identifiable, Equatable {
    let id: Int
    let isGroupChat: Bool
    /// Always nil for direct chats.
    let name: String?
    /// Image hash, served by GET /images/{hash}.
    let imageUrl: String?
    let createdAt: Date
    let createdBy: Int?
    /// Public group chats can be found and joined by every user.
    let isPublic: Bool
    let latestMessageTimestamp: Date?
    /// At most 50 characters.
    let latestMessagePreview: String?
    let latestMessageSenderId: Int?
    let members: [ChatMemberDTO]
    /// Ordered from oldest to newest. In a delta only the new messages, in the public chat list none.
    let messages: [MessageDTO]

    private enum CodingKeys: String, CodingKey {
        case id, name, imageUrl, createdAt, createdBy, latestMessageTimestamp, latestMessagePreview, latestMessageSenderId, members, messages
        case isGroupChat = "groupChat"
        case isPublic = "public"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(Int.self, forKey: .id)
        isGroupChat = try container.decode(Bool.self, forKey: .isGroupChat)
        name = try container.decodeIfPresent(String.self, forKey: .name)
        imageUrl = try container.decodeIfPresent(String.self, forKey: .imageUrl)
        createdAt = try container.decode(Date.self, forKey: .createdAt)
        createdBy = try container.decodeIfPresent(Int.self, forKey: .createdBy)
        isPublic = try container.decode(Bool.self, forKey: .isPublic)
        latestMessageTimestamp = try container.decodeIfPresent(Date.self, forKey: .latestMessageTimestamp)
        latestMessagePreview = try container.decodeIfPresent(String.self, forKey: .latestMessagePreview)
        latestMessageSenderId = try container.decodeIfPresent(Int.self, forKey: .latestMessageSenderId)
        members = try container.decode([ChatMemberDTO].self, forKey: .members)
        messages = try container.decodeIfPresent([MessageDTO].self, forKey: .messages) ?? []
    }
}

struct ChatMemberDTO: Decodable, Equatable {
    let userId: Int
    /// The newest message this member has read, 0 if none.
    let lastReadMessageId: Int
    /// Whether the member is an admin of the group, nil for direct chats. Admins can rename the group, change its image,
    /// make it public or private, add and remove members, make other members admins and delete it.
    let admin: Bool?
}

struct MessageDTO: Decodable, Identifiable, Equatable {
    let id: Int
    let chatId: Int
    /// Nil if the sender's account no longer exists.
    let senderId: Int?
    let createdAt: Date
    /// Nil for photo-only messages.
    let content: String?
    /// Image hash of the attached photo, served by GET /images/{hash}.
    let imageUrl: String?
    /// Set if the sender deleted the message: it comes without text and photo, only in a delta (and as the answer to
    /// a repeated send), and has to be removed. The full chat list leaves deleted messages out.
    var deletedAt: Date? = nil
}

struct ChatReadStateDTO: Decodable, Equatable {
    let chatId: Int
    let members: [ChatMemberDTO]
}

struct ChatListDTO: Decodable {
    /// All chats of the current user with all their messages.
    let chats: [ChatDTO]
    /// Pass to `ChatService.changes(since:)` for the next sync. Kept as the server sent it to not lose precision.
    let syncTime: String
}

/// Treat every chat as an upsert and skip messages you already have, because a change can be delivered more than once.
struct ChatDeltaDTO: Decodable {
    /// Chats that are new, renamed, have a new image, were made public or private, have new messages or the user was
    /// added to. Each has its current metadata and members, but only the messages sent since the last sync, except
    /// the chats the user was added to, which have all their messages.
    let chats: [ChatDTO]
    /// The members and read state of every chat of the user. Read state changes have no timestamps, so they are always sent.
    let readStates: [ChatReadStateDTO]
    let syncTime: String
}

// MARK: - Requests

struct CreateChatRequest: Encodable {
    let userId: Int
}

struct MarkReadRequest: Encodable {
    let messageId: Int
}

struct AddMembersRequest: Encodable {
    let userIds: [Int]
}

struct UpdatePublicRequest: Encodable {
    let `public`: Bool
}

struct UpdateAdminRequest: Encodable {
    let admin: Bool
}
