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
    /// Whether the AI is still answering the last message, which is the user's then. Loading the conversation again
    /// a few seconds later has the answer, or neither of them if the AI failed. Always false in the list of conversations.
    let answerPending: Bool
}

enum AIMessageRole: String, Decodable, Hashable {
    case user
    case assistant
}

struct AIMessageDTO: Decodable, Identifiable, Equatable, Hashable {
    let id: Int
    let conversationId: Int
    /// The client UUID the message was sent with, nil for the answers of the AI
    let clientUuid: UUID?
    let role: AIMessageRole
    let content: String
    let createdAt: Date
}

struct SendAIMessageResponseDTO: Decodable {
    let userMessage: AIMessageDTO
    let assistantMessage: AIMessageDTO
}

/// What the server sends before the stored answer while the AI answers a message.
enum AIAnswerEvent {
    /// The message is stored, the answer is written from now on also without the connection
    case start(AIMessageDTO)
    /// The next part of the answer
    case delta(String)
}

/// The data of the events of POST /ai/conversations/{id}/messages/stream, see `AIService.send`
enum AIAnswerEventData {
    struct Start: Decodable {
        let userMessage: AIMessageDTO
    }

    struct Delta: Decodable {
        let content: String
    }
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
