//
//  AIService.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 04.10.2026.
//

import Foundation

/// The conversations of the current user with the Gym-AI against /ai.
///
/// The conversations are only kept on the server, so they need a connection.
final class AIService {
    private let api: APIClient

    init(api: APIClient) {
        self.api = api
    }

    /// All conversations without their messages, the most recently updated first.
    func conversations() async throws -> [AIConversationDTO] {
        try await api.send(.allAIConversations)
    }

    func conversation(id: Int) async throws -> AIConversationDTO {
        try await api.send(.aiConversation(id: id))
    }

    /// Creates an empty conversation. Without a title, the beginning of the first message becomes the title.
    func createConversation(title: String? = nil) async throws -> AIConversationDTO {
        try await api.send(.createAIConversation(CreateAIConversationRequest(title: title)))
    }

    func renameConversation(id: Int, to title: String) async throws -> AIConversationDTO {
        try await api.send(.updateAIConversation(id: id, UpdateAIConversationRequest(title: title)))
    }

    func deleteConversation(id: Int) async throws {
        try await api.send(.deleteAIConversation(id: id))
    }

    /// Sends a message and returns the stored message and answer once the AI has written it. Meanwhile `onEvent` gets
    /// the answer as far as it is written: `.start` once the message is stored, a `.delta` for each part.
    ///
    /// If the AI fails (503, "AIServiceUnavailableError"), nothing is stored and the message can be sent again. A lost
    /// connection (`APIError.transport`) doesn't stop the answer: it is written and stored anyway, the conversation has
    /// it later (`answerPending`). Sending again with the same client UUID follows the answer that is being written
    /// or returns the stored one, instead of asking the AI again.
    func send(
        _ content: String,
        to conversationId: Int,
        clientUuid: UUID? = nil,
        onEvent: @MainActor (AIAnswerEvent) -> Void = { _ in }
    ) async throws -> SendAIMessageResponseDTO {
        let request = SendAIMessageRequest(content: content, clientUuid: clientUuid)
        for try await event in try await api.events(.streamAIMessage(conversationId: conversationId, request)) {
            switch event.event {
            case "start":
                await onEvent(.start(try api.decode(AIAnswerEventData.Start.self, from: event).userMessage))
            case "delta":
                await onEvent(.delta(try api.decode(AIAnswerEventData.Delta.self, from: event).content))
            case "done":
                return try api.decode(from: event)
            case "error":
                let body = try api.decode(APIErrorBody.self, from: event)
                throw APIError.server(status: 503, code: body.code, message: body.message ?? "The AI is currently unavailable. Please try again later.")
            default:
                break
            }
        }
        // Ended without the answer, e.g. because the backend was stopped
        throw APIError.transport(URLError(.networkConnectionLost))
    }
}

private extension Endpoint {
    static let allAIConversations = Endpoint(method: .get, path: "/ai/conversations")

    static func aiConversation(id: Int) -> Endpoint {
        Endpoint(method: .get, path: "/ai/conversations/\(id)")
    }

    static func createAIConversation(_ request: CreateAIConversationRequest) -> Endpoint {
        Endpoint(method: .post, path: "/ai/conversations", body: .json(request))
    }

    static func updateAIConversation(id: Int, _ request: UpdateAIConversationRequest) -> Endpoint {
        Endpoint(method: .patch, path: "/ai/conversations/\(id)", body: .json(request))
    }

    static func deleteAIConversation(id: Int) -> Endpoint {
        Endpoint(method: .delete, path: "/ai/conversations/\(id)")
    }

    // The answer is streamed. 60 seconds without any data, where the server sends something at least every 15 seconds,
    // mean that the connection is lost.
    static func streamAIMessage(conversationId: Int, _ request: SendAIMessageRequest) -> Endpoint {
        Endpoint(method: .post, path: "/ai/conversations/\(conversationId)/messages/stream", body: .json(request), timeout: 60)
    }
}
