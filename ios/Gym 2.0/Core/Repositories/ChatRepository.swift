//
//  ChatRepository.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 22.10.2026.
//

import Foundation
import SwiftData

/// The chats with their members and messages. They are changed online, here only the server's answer is applied.
@MainActor
struct ChatRepository: Repository {

    let context: ModelContext

    /// The stored chat with this server ID, nil if there is none or it couldn't be fetched
    func chat(serverId: Int) -> Chat? {
        try? existingChat(serverId: serverId)
    }

    /// Like `chat(serverId:)`, but throws if the fetch fails
    func existingChat(serverId: Int) throws -> Chat? {
        try context.fetch(FetchDescriptor<Chat>(predicate: #Predicate { $0.serverId == serverId })).first
    }

    /// Removes the chat after the user left or deleted it
    func delete(_ chat: Chat) {
        context.delete(chat)
        saveLoggingErrors("the deletion of a chat")
    }

    /// Removes a message that was deleted for everyone
    func delete(_ message: Message) {
        context.delete(message)
        saveLoggingErrors("the deletion of a message")
    }

    /// Removes a member right away, the next sync brings the server's members
    func removeMember(_ userId: Int, from chat: Chat) {
        if let member = chat.members.first(where: { $0.userId == userId }) {
            context.delete(member)
        }
        saveLoggingErrors("the removal of a chat member")
    }
}
