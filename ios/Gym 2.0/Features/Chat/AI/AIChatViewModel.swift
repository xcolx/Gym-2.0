//
//  AIChatViewModel.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 23.05.2025.
//

import Foundation

/// A message shown in the AI chat. The user's messages are shown as sent right away, the typing indicator shows
/// that the answer is still coming. The server only stores a message together with its answer, so if that fails,
/// the message is marked as failed.
struct AIChatMessage: Identifiable, Equatable {
    enum Status: Equatable {
        case sent
        /// Sending failed with the given error message. The message can be sent again or discarded.
        case failed(String)
    }

    /// Stays the same while the message is sent. For messages sent from this device it is also the client UUID,
    /// so sending again after a lost response returns the stored answer instead of asking the AI a second time.
    let id: UUID
    let role: AIMessageRole
    let content: String
    var date: Date
    var status: Status = .sent
}

extension AIChatMessage {
    init(_ message: AIMessageDTO) {
        self.init(id: UUID(), role: message.role, content: message.content, date: message.createdAt)
    }
}

/// One conversation with the Gym-AI. A new conversation is only created on the server when its first message is sent,
/// so opening and leaving a new chat doesn't leave an empty conversation behind.
@Observable
@MainActor
final class AIChatViewModel {
    static let maxMessageLength = 10_000
    private static let maxTitleLength = 50

    private(set) var conversationId: Int?
    private(set) var title: String?
    private(set) var messages: [AIChatMessage] = []
    private(set) var isLoading = false
    private(set) var isWaitingForAnswer = false
    private(set) var loadError: String?

    init(conversation: AIConversationDTO?) {
        conversationId = conversation?.id
        title = conversation?.title
    }

    /// A failed message has to be sent again or discarded first, so the messages reach the AI in the order they are shown.
    var canSend: Bool {
        !isLoading && !isWaitingForAnswer && loadError == nil && !messages.contains { $0.isFailed }
    }

    func load(using service: AIService) async {
        guard let conversationId, messages.isEmpty, !isLoading else { return }
        isLoading = true
        defer { isLoading = false }

        do {
            let conversation = try await service.conversation(id: conversationId)
            title = conversation.title
            messages = conversation.messages.map(AIChatMessage.init)
            loadError = nil
        } catch {
            loadError = error.localizedDescription
        }
    }

    func send(_ text: String, using service: AIService) async {
        let content = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard canSend, !content.isEmpty, content.count <= Self.maxMessageLength else { return }

        let message = AIChatMessage(id: UUID(), role: .user, content: content, date: .now)
        messages.append(message)
        await deliver(message, using: service)
    }

    func retry(_ message: AIChatMessage, using service: AIService) async {
        guard !isWaitingForAnswer, let index = messages.firstIndex(where: { $0.id == message.id }) else { return }
        messages[index].status = .sent
        messages[index].date = .now
        await deliver(messages[index], using: service)
    }

    func discard(_ message: AIChatMessage) {
        messages.removeAll { $0.id == message.id }
    }

    private func deliver(_ message: AIChatMessage, using service: AIService) async {
        isWaitingForAnswer = true
        defer { isWaitingForAnswer = false }

        do {
            let conversationId = try await ensureConversation(using: service)
            let response = try await service.send(message.content, to: conversationId, clientUuid: message.id)

            updateMessage(message.id) {
                $0.status = .sent
                $0.date = response.userMessage.createdAt
            }
            messages.append(AIChatMessage(response.assistantMessage))
            // The server makes the first message the title of a conversation without one
            if title == nil {
                title = String(message.content.prefix(Self.maxTitleLength)).trimmingCharacters(in: .whitespacesAndNewlines)
            }
        } catch {
            updateMessage(message.id) { $0.status = .failed(error.localizedDescription) }
        }
    }

    private func ensureConversation(using service: AIService) async throws -> Int {
        if let conversationId {
            return conversationId
        }
        let conversation = try await service.createConversation()
        conversationId = conversation.id
        return conversation.id
    }

    private func updateMessage(_ id: UUID, _ change: (inout AIChatMessage) -> Void) {
        guard let index = messages.firstIndex(where: { $0.id == id }) else { return }
        change(&messages[index])
    }
}

/// The list of the user's conversations with the Gym-AI.
@Observable
@MainActor
final class AIConversationsViewModel {
    private(set) var conversations: [AIConversationDTO] = []
    private(set) var hasLoaded = false
    private(set) var isLoading = false
    private(set) var loadError: String?
    var actionError: String?

    func load(using service: AIService) async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }

        do {
            conversations = try await service.conversations()
            loadError = nil
            hasLoaded = true
        } catch {
            loadError = error.localizedDescription
        }
    }

    func delete(_ conversation: AIConversationDTO, using service: AIService) async {
        guard let index = conversations.firstIndex(of: conversation) else { return }
        conversations.remove(at: index)

        do {
            try await service.deleteConversation(id: conversation.id)
        } catch {
            conversations.insert(conversation, at: min(index, conversations.count))
            actionError = error.localizedDescription
        }
    }

    func rename(_ conversation: AIConversationDTO, to title: String, using service: AIService) async {
        let title = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty, title != conversation.title else { return }

        do {
            let renamed = try await service.renameConversation(id: conversation.id, to: title)
            conversations.removeAll { $0.id == renamed.id }
            conversations.insert(renamed, at: 0)
        } catch {
            actionError = error.localizedDescription
        }
    }
}

private extension AIChatMessage {
    var isFailed: Bool {
        if case .failed = status { return true }
        return false
    }
}
