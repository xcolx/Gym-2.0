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

    /// Sends a message and waits for the answer of the AI, which can take a while.
    /// If the AI is unavailable (503), nothing is stored and the message can be sent again.
    /// Sending again with the same client UUID returns the stored message and answer instead of asking the AI again.
    func send(_ content: String, to conversationId: Int, clientUuid: UUID? = nil) async throws -> SendAIMessageResponseDTO {
        try await api.send(.sendAIMessage(conversationId: conversationId, SendAIMessageRequest(content: content, clientUuid: clientUuid)))
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

    // The server waits up to 90 seconds for the AI, so the default timeout of 30 seconds is too short. 100 seconds:
    // Cloudflare gives up on api.gym2.app after that anyway.
    static func sendAIMessage(conversationId: Int, _ request: SendAIMessageRequest) -> Endpoint {
        Endpoint(method: .post, path: "/ai/conversations/\(conversationId)/messages", body: .json(request), timeout: 100)
    }
}
