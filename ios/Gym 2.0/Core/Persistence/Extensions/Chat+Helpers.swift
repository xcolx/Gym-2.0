//
//  Chat+Helpers.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 14.10.2026.
//

import Foundation
import SwiftData

extension Chat {

    /// For sorting the chat list, the newest first
    var lastActivity: Date {
        latestMessageTimestamp ?? createdAt
    }

    func otherMemberId(currentUserId: Int?) -> Int? {
        guard !groupChat else { return nil }
        return members.first { $0.userId != currentUserId }?.userId
    }

    /// The group name, or the username of the other member of a direct chat
    func title(users: [Int: User], currentUserId: Int?) -> String {
        if groupChat {
            return name ?? "Group"
        }
        guard let otherId = otherMemberId(currentUserId: currentUserId) else { return "Chat" }
        return users[otherId]?.username ?? "Unknown user"
    }

    /// The messages of others the user hasn't read yet
    func unreadCount(currentUserId: Int?) -> Int {
        guard let currentUserId, let member = members.first(where: { $0.userId == currentUserId }) else { return 0 }
        return messages.count { $0.serverId > member.lastReadMessageId && $0.senderId != currentUserId }
    }

    /// Direct chats with a blocked user are hidden. They stay on the server and come back once the user is unblocked.
    func isHidden(users: [Int: User], currentUserId: Int?) -> Bool {
        guard let otherId = otherMemberId(currentUserId: currentUserId) else { return false }
        return users[otherId]?.isBlocked ?? false
    }

    /// The server only accepts messages in a direct chat while both users are friends and neither blocked the other.
    /// Nil if messages can be sent, otherwise the reason to show instead of the input field.
    func sendingBlockedReason(users: [Int: User], currentUserId: Int?) -> String? {
        guard let otherId = otherMemberId(currentUserId: currentUserId) else { return nil }
        guard let other = users[otherId] else {
            // Friends are always stored, but before the first user sync none are known yet
            guard let currentUserId, users[currentUserId] != nil else { return nil }
            return "You can only send messages to friends."
        }
        if other.isBlocked {
            return "You blocked \(other.username). Unblock them in the settings to send messages."
        }
        if !other.isFriend {
            return "You can only send messages to friends."
        }
        return nil
    }

    var sortedMessages: [Message] {
        messages.sorted { $0.serverId < $1.serverId }
    }
}

extension User {
    static func byServerId(_ users: [User]) -> [Int: User] {
        Dictionary(users.map { ($0.serverId, $0) }, uniquingKeysWith: { first, _ in first })
    }
}
