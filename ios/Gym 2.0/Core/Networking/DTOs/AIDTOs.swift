//
//  AIDTOs.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 04.10.2026.
//

import Foundation

// Mirrors backend/app/schemas/ai.py

struct AIConversationDTO: Decodable, Identifiable, Equatable, Hashable {
    let id: Int
    /// Nil until it is set or the first message is sent, which then becomes the title (at most 50 characters).
    let title: String?
    let createdAt: Date
    /// Date of the latest message or rename.
    let updatedAt: Date
    /// Ordered from oldest to newest. Empty in the list of conversations.
    let messages: [AIMessageDTO]
}

enum AIMessageRole: String, Decodable, Hashable {
    case user
    case assistant
}

struct AIMessageDTO: Decodable, Identifiable, Equatable, Hashable {
    let id: Int
    let conversationId: Int
    let role: AIMessageRole
    let content: String
    let createdAt: Date
}

struct SendAIMessageResponseDTO: Decodable {
    let userMessage: AIMessageDTO
    let assistantMessage: AIMessageDTO
}

// MARK: - Requests

struct CreateAIConversationRequest: Encodable {
    /// At most 50 characters. Without a title, the beginning of the first message becomes the title.
    let title: String?
}

struct UpdateAIConversationRequest: Encodable {
    /// At most 50 characters.
    let title: String
}

struct SendAIMessageRequest: Encodable {
    /// At most 10'000 characters.
    let content: String
    let clientUuid: UUID?
}
