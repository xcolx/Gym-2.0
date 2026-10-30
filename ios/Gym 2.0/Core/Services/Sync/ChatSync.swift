//
//  ChatSync.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 12.10.2026.
//

import Foundation
import OSLog
import SwiftData

/// Syncs the chats, their members and their messages. Used by `SyncService`.
///
/// Chats only change online, so they are pulled. The only local change is a message in `Chat.input` that was sent
/// (`inputUUID` is set) but not accepted by the server yet: it's sent again with the same UUID by every sync,
/// so the server never creates it twice.
@MainActor
final class ChatSync {

    private let context: ModelContext
    private let chatService: ChatService

    /// The sync and the polling of an open chat can pull at the same time, the second waits for the first instead
    private var runningPull: Task<Void, Error>?

    init(context: ModelContext, chatService: ChatService) {
        self.context = context
        self.chatService = chatService
    }

    // MARK: - Push

    /// Returns the messages to show for the messages the server rejected
    func pushMessages() async throws -> [String] {
        var rejected: [String] = []
        for chat in try context.fetchAll(Chat.self) where chat.inputUUID != nil {
            if let message = try await send(chat) {
                rejected.append(message)
            }
        }
        return rejected
    }

    /// Sends the text in the input field of the chat. Throws if the server couldn't be reached, the text and
    /// its UUID are kept then. A message the server rejects stays in the input field, but isn't sent again:
    /// returns the message to show then.
    func send(_ chat: Chat) async throws -> String? {
        guard let clientUuid = chat.inputUUID else { return nil }
        let text = chat.input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else {
            chat.inputUUID = nil
            return nil
        }

        do {
            let dto = try await chatService.sendMessage(to: chat.serverId, text: text, clientUuid: clientUuid)
            guard !chat.isDeleted, chat.modelContext != nil else { return nil }
            try insert(dto, into: chat)
            chat.latestMessageTimestamp = dto.createdAt
            chat.latestMessagePreview = String(text.prefix(50))
            chat.latestMessageSenderId = dto.senderId
            if chat.inputUUID == clientUuid {
                chat.inputUUID = nil
                // The user may have started the next message in the meantime
                if chat.input.trimmingCharacters(in: .whitespacesAndNewlines) == text {
                    chat.input = ""
                }
            }
            return nil
        } catch {
            guard error.isRejection else { throw error }
            Logger.sync.error("The server rejected a message to the chat \(chat.serverId): \(error.localizedDescription, privacy: .public)")
            if chat.inputUUID == clientUuid {
                chat.inputUUID = nil
            }
            return "Your message could not be sent: \(error.localizedDescription)"
        }
    }

    /// Sends a photo with an optional caption right away. Photos aren't stored locally, so unlike text they aren't
    /// sent again by a later sync.
    func sendPhoto(_ upload: ImageUpload, caption: String?, to chat: Chat) async throws {
        let dto = try await chatService.sendMessage(to: chat.serverId, text: caption, image: upload, clientUuid: UUID())
        guard !chat.isDeleted, chat.modelContext != nil else { return }
        try insert(dto, into: chat)
        chat.latestMessageTimestamp = dto.createdAt
        // Like the server's preview
        chat.latestMessagePreview = caption.map { String($0.prefix(50)) } ?? "📷 Photo"
        chat.latestMessageSenderId = dto.senderId
    }

    /// Marks the newest message of the chat as read by the user, if it isn't yet
    func markRead(_ chat: Chat, userId: Int) async throws {
        guard let newest = chat.messages.map(\.serverId).max(),
              let member = chat.members.first(where: { $0.userId == userId }),
              member.lastReadMessageId < newest
        else { return }
        try await chatService.markRead(chatId: chat.serverId, upTo: newest)
        guard !chat.isDeleted, chat.modelContext != nil else { return }
        // The members may have been replaced by a pull in the meantime
        if let member = chat.members.first(where: { $0.userId == userId }), member.lastReadMessageId < newest {
            member.lastReadMessageId = newest
        }
    }

    /// Stores a chat the server returned for a create, an update or a join
    func store(_ dto: ChatDTO) throws {
        var local = try chatsByServerId()
        var messageIds = try existingMessageIds()
        upsert(dto, local: &local, messageIds: &messageIds)
    }

    // MARK: - Pull

    func pull() async throws {
        if let runningPull {
            try await runningPull.value
            return
        }
        let task = Task { try await pullOnce() }
        runningPull = task
        defer { runningPull = nil }
        try await task.value
    }

    private func pullOnce() async throws {
        if let syncTime = SyncTime.get(.chats) {
            do {
                let delta = try await chatService.changes(since: syncTime)
                try apply(delta)
                SyncTime.set(delta.syncTime, for: .chats)
                return
            } catch {
                // e.g. a sync time the server doesn't accept anymore, load everything instead
                guard error.isRejection else { throw error }
            }
        }

        let list = try await chatService.all()
        var local = try chatsByServerId()
        var messageIds = try existingMessageIds()
        let serverIds = Set(list.chats.map(\.id))
        for dto in list.chats {
            upsert(dto, local: &local, messageIds: &messageIds, complete: true)
        }
        removeChats(except: serverIds, from: local)
        SyncTime.set(list.syncTime, for: .chats)
    }

    private func apply(_ delta: ChatDeltaDTO) throws {
        var local = try chatsByServerId()
        var messageIds = try existingMessageIds()
        for dto in delta.chats {
            upsert(dto, local: &local, messageIds: &messageIds)
        }

        // The read states contain every chat of the user
        for readState in delta.readStates {
            guard let chat = local[readState.chatId] else {
                // Missed somehow, it's loaded with the next (full) pull
                Logger.sync.error("Unknown chat \(readState.chatId) in the read states")
                SyncTime.remove(.chats)
                continue
            }
            chat.replaceMembers(with: readState.members)
        }
        removeChats(except: Set(delta.readStates.map(\.chatId)), from: local)
    }

    /// Updates the metadata and members, adds the messages that aren't stored yet and removes the deleted ones.
    /// `complete`: the full list of the chat (GET /chats), so the stored messages it doesn't contain anymore
    /// were deleted as well, also the ones a delta never reported (e.g. deleted in the admin).
    private func upsert(_ dto: ChatDTO, local: inout [Int: Chat], messageIds: inout Set<Int>, complete: Bool = false) {
        let chat: Chat
        if let existing = local[dto.id] {
            chat = existing
            chat.apply(dto)
        } else {
            chat = Chat(dto)
            context.insert(chat)
            local[dto.id] = chat
        }
        chat.replaceMembers(with: dto.members)

        // Deleted by their sender: removed, or never stored if they were sent and deleted since the last sync
        let deletedIds = Set(dto.messages.filter { $0.deletedAt != nil }.map(\.id))
        let keptIds = Set(dto.messages.filter { $0.deletedAt == nil }.map(\.id))
        for message in chat.messages where deletedIds.contains(message.serverId) || (complete && !keptIds.contains(message.serverId)) {
            messageIds.remove(message.serverId)
            context.delete(message)
        }

        for message in dto.messages where message.deletedAt == nil && !messageIds.contains(message.id) {
            context.insert(Message(message, chat: chat))
            messageIds.insert(message.id)
        }
    }

    private func insert(_ dto: MessageDTO, into chat: Chat) throws {
        let id = dto.id
        let existing = try context.fetch(FetchDescriptor<Message>(predicate: #Predicate { $0.serverId == id }))
        // A repeated send of a message that was deleted in the meantime returns it as deleted
        if dto.deletedAt != nil {
            existing.forEach(context.delete)
        } else if existing.isEmpty {
            context.insert(Message(dto, chat: chat))
        }
    }

    /// The user isn't a member of these chats anymore
    private func removeChats(except serverIds: Set<Int>, from local: [Int: Chat]) {
        for (serverId, chat) in local where !serverIds.contains(serverId) {
            context.delete(chat)
        }
    }

    private func chatsByServerId() throws -> [Int: Chat] {
        Dictionary(try context.fetchAll(Chat.self).map { ($0.serverId, $0) }, uniquingKeysWith: { first, _ in first })
    }

    private func existingMessageIds() throws -> Set<Int> {
        Set(try context.fetchAll(Message.self).map(\.serverId))
    }
}
