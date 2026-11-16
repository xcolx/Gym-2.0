//
//  AIChatViewModel.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 23.05.2025.
//

import Foundation

/// A message shown in the AI chat. The user's messages are shown as sent right away, the typing indicator and then
/// the growing answer show that the answer is still coming. The server only keeps a message together with its answer,
/// so if the AI fails, the message is marked as failed.
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
    /// The user's messages keep their client UUID as ID, so a message sent from this device stays the same message.
    init(_ message: AIMessageDTO) {
        self.init(id: message.clientUuid ?? UUID(), role: message.role, content: message.content, date: message.createdAt)
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
    /// The answer as far as the AI has written it, nil before its first part (the typing indicator is shown then).
    private(set) var streamingAnswer: String?
    private(set) var loadError: String?

    /// How often the conversation is loaded again while its answer is written without a connection that streams it
    private let answerPollInterval: Duration
    /// Whether the server was still answering the last message when the conversation was loaded
    private var answerIsPending = false
    /// Set when the chat was left, the conversation isn't loaded again and again then
    private var isClosed = false

    init(conversation: AIConversationDTO?, answerPollInterval: Duration = .seconds(3)) {
        conversationId = conversation?.id
        title = conversation?.title
        self.answerPollInterval = answerPollInterval
    }

    /// A failed message has to be sent again or discarded first, so the messages reach the AI in the order they are shown.
    var canSend: Bool {
        !isLoading && !isWaitingForAnswer && loadError == nil && !messages.contains { $0.isFailed }
    }

    /// Loads the messages. If the AI is still answering the last one (sent before the chat was opened, or from another
    /// device), the conversation is loaded again until it has the answer.
    func load(using service: AIService) async {
        isClosed = false
        guard let conversationId, !isLoading else { return }

        if messages.isEmpty {
            isLoading = true
            do {
                let conversation = try await service.conversation(id: conversationId)
                show(conversation)
                loadError = nil
            } catch {
                loadError = error.localizedDescription
            }
            isLoading = false
        }
        if answerIsPending {
            await followPendingAnswer(in: conversationId, using: service)
        }
    }

    /// Called when the chat is left. An answer that is being written is stored anyway and shown when the chat is opened again.
    func close() {
        isClosed = true
    }

    private func show(_ conversation: AIConversationDTO) {
        title = conversation.title
        messages = conversation.messages.map(AIChatMessage.init)
        answerIsPending = conversation.answerPending
    }

    private func followPendingAnswer(in conversationId: Int, using service: AIService) async {
        guard !isWaitingForAnswer else { return }
        isWaitingForAnswer = true
        defer { isWaitingForAnswer = false }

        do {
            while !isClosed {
                try await Task.sleep(for: answerPollInterval)
                let conversation = try await service.conversation(id: conversationId)
                if !conversation.answerPending {
                    // With the answer, or without the message if the AI failed
                    show(conversation)
                    return
                }
            }
        } catch {
            // Left the chat, offline or the server is down: the conversation shows what is known, opening it again continues
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
        streamingAnswer = nil
        defer {
            isWaitingForAnswer = false
            streamingAnswer = nil
        }

        do {
            let conversationId = try await ensureConversation(using: service)
            do {
                let response = try await service.send(message.content, to: conversationId, clientUuid: message.id) { [weak self] event in
                    switch event {
                    case .start(let userMessage):
                        self?.updateMessage(message.id) { $0.date = userMessage.createdAt }
                    case .delta(let content):
                        self?.streamingAnswer = (self?.streamingAnswer ?? "") + content
                    }
                }
                updateMessage(message.id) {
                    $0.status = .sent
                    $0.date = response.userMessage.createdAt
                }
                messages.append(AIChatMessage(response.assistantMessage))
                // The server makes the first message the title of a conversation without one
                if title == nil {
                    title = String(message.content.prefix(Self.maxTitleLength)).trimmingCharacters(in: .whitespacesAndNewlines)
                }
            } catch where Self.answerMayStillCome(after: error) {
                // Back to the typing indicator, the part of the answer that arrived comes again with the whole answer
                streamingAnswer = nil
                try await waitForAnswer(to: message, in: conversationId, after: error, using: service)
            }
        } catch {
            updateMessage(message.id) { $0.status = .failed(error.localizedDescription) }
        }
    }

    /// Whether the server may be writing the answer although sending failed: the connection was lost (the answer is
    /// written without it), or the server is still answering this message from an earlier try. Not if the AI itself
    /// failed or the message was rejected, nothing is stored then.
    private static func answerMayStillCome(after error: Error) -> Bool {
        switch error as? APIError {
        case .transport:
            return true
        case .server(let status, let code, _):
            if code == "AIAnswerPendingError" { return true }
            if code == "AIServiceUnavailableError" { return false }
            return status >= 500
        default:
            return false
        }
    }

    /// After sending failed with `cause` in a way that may have left the server writing the answer: loads the
    /// conversation until it has the answer to the message. Throws `cause` if the server doesn't have the message (it
    /// never arrived, or the AI failed) and the error of loading if the server can't be reached. Sending the message
    /// again is safe in both cases, the server recognizes it by its client UUID.
    private func waitForAnswer(to message: AIChatMessage, in conversationId: Int, after cause: Error, using service: AIService) async throws {
        while true {
            let conversation = try await service.conversation(id: conversationId)
            guard let index = conversation.messages.firstIndex(where: { $0.clientUuid == message.id }) else { throw cause }
            if index + 1 < conversation.messages.count {
                show(conversation)
                return
            }
            if isClosed { return }
            try await Task.sleep(for: answerPollInterval)
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

extension AIChatMessage {
    var isFailed: Bool {
        if case .failed = status { return true }
        return false
    }
}
