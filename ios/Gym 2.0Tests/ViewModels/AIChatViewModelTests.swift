//
//  AIChatViewModelTests.swift
//  Gym 2.0Tests
//
//  Created by Colin Rüegg on 24.10.2026.
//
//  The conversations with the AI coach: loading, sending (also into a new conversation), the streamed answer, lost
//  connections, failed messages and the list
//

import Foundation
import Testing
@testable import Gym_2_0

@MainActor
@Suite struct AIChatViewModelTests {

    let backend = FakeBackend()
    var service: AIService { AIService(api: StubURLProtocol.client(handler: backend.handle)) }

    nonisolated static func messageJSON(id: Int, role: String, content: String, conversationId: Int = 3, clientUUID: String? = nil) -> String {
        #"{"id": \#(id), "conversation_id": \#(conversationId), "client_uuid": \#(clientUUID.map { "\"\($0)\"" } ?? "null"), "role": "\#(role)", "content": "\#(content)", "created_at": "2026-10-20T10:00:0\#(id % 10)+00:00"}"#
    }

    nonisolated static func conversationJSON(id: Int = 3, title: String? = "Leg day", messages: [String] = [], answerPending: Bool = false) -> String {
        #"{"id": \#(id), "title": \#(title.map { "\"\($0)\"" } ?? "null"), "created_at": "2026-10-20T10:00:00+00:00", "updated_at": "2026-10-20T10:00:00+00:00", "messages": [\#(messages.joined(separator: ","))], "answer_pending": \#(answerPending)}"#
    }

    static let streamPath = "/ai/conversations/3/messages/stream"

    /// The events of the answer "Answer to <text>" to a sent message, which is streamed in two parts
    nonisolated static func answerEvents(to request: StubURLProtocol.Request, conversationId: Int = 3) -> [(String, String)] {
        let content = request.json?["content"] as? String ?? ""
        let userMessage = messageJSON(id: 11, role: "user", content: content, conversationId: conversationId, clientUUID: request.json?["client_uuid"] as? String)
        let answer = messageJSON(id: 12, role: "assistant", content: "Answer to \(content)", conversationId: conversationId)
        return [
            ("start", #"{"user_message": \#(userMessage)}"#),
            ("delta", #"{"content": "Answer "}"#),
            ("delta", #"{"content": "to \#(content)"}"#),
            ("done", #"{"user_message": \#(userMessage), "assistant_message": \#(answer)}"#),
        ]
    }

    /// Answers the messages sent to the conversation with "Answer to <text>"
    func answerMessages(in conversationId: Int = 3) {
        backend.on("POST", "/ai/conversations/\(conversationId)/messages/stream") { request in
            .events(Self.answerEvents(to: request, conversationId: conversationId))
        }
    }

    func conversation(_ json: String = conversationJSON()) throws -> AIConversationDTO {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(AIConversationDTO.self, from: Data(json.utf8))
    }

    // MARK: - AIChatViewModel

    @Test func loadsTheMessagesOfAConversation() async throws {
        backend.on("GET", "/ai/conversations/3") { _ in
            .json(Self.conversationJSON(messages: [Self.messageJSON(id: 1, role: "user", content: "Hi"), Self.messageJSON(id: 2, role: "assistant", content: "Hello")]))
        }
        let model = AIChatViewModel(conversation: try conversation())

        await model.load(using: service)

        #expect(model.messages.map(\.content) == ["Hi", "Hello"])
        #expect(model.messages.map(\.role) == [.user, .assistant])
        #expect(model.canSend)
    }

    @Test func cantSendWhileTheConversationCouldntBeLoaded() async throws {
        backend.on("GET", "/ai/conversations/3") { _ in .json(#"{"detail": "Server down"}"#, status: 500) }
        let model = AIChatViewModel(conversation: try conversation())

        await model.load(using: service)

        #expect(model.loadError != nil)
        #expect(!model.canSend)
    }

    @Test func createsTheConversationWithTheFirstMessageAndTitlesItLikeTheServer() async {
        backend.on("POST", "/ai/conversations") { _ in .json(Self.conversationJSON(id: 3, title: nil), status: 201) }
        answerMessages()
        let model = AIChatViewModel(conversation: nil)
        let text = "  How many sets should I do for my legs when I train them twice a week?  "

        await model.send(text, using: service)

        #expect(model.conversationId == 3)
        #expect(model.messages.map(\.content) == [text.trimmingCharacters(in: .whitespaces), "Answer to \(text.trimmingCharacters(in: .whitespaces))"])
        #expect(model.messages.allSatisfy { $0.status == .sent })
        #expect(model.title == "How many sets should I do for my legs when I train")
        #expect(!model.isWaitingForAnswer)
    }

    @Test func sendsTheClientUUIDOfTheMessage() async throws {
        answerMessages()
        let model = AIChatViewModel(conversation: try conversation())

        await model.send("Hi", using: service)

        let request = try #require(backend.requests("POST", Self.streamPath).first)
        #expect(request.json?["client_uuid"] as? String == model.messages[0].id.uuidString)
    }

    @Test func ignoresEmptyAndTooLongMessages() async throws {
        let model = AIChatViewModel(conversation: try conversation())

        await model.send("   ", using: service)
        await model.send(String(repeating: "a", count: AIChatViewModel.maxMessageLength + 1), using: service)

        #expect(model.messages.isEmpty)
        #expect(backend.paths.isEmpty)
    }

    @Test func keepsAFailedMessageUntilItIsSentAgainOrDiscarded() async throws {
        // The AI fails after it has started to answer
        backend.on("POST", Self.streamPath) { request in
            .events(Array(Self.answerEvents(to: request).prefix(2)) + [("error", #"{"error": "AIServiceUnavailableError", "detail": "The AI is busy."}"#)])
        }
        let model = AIChatViewModel(conversation: try conversation())

        await model.send("Hi", using: service)
        #expect(model.messages.count == 1)
        #expect(model.messages[0].status == .failed("The AI is busy."))
        #expect(model.streamingAnswer == nil)
        #expect(!model.canSend)
        // Nothing is stored then, so there is no answer to wait for
        #expect(backend.requests("GET", "/ai/conversations/3").isEmpty)

        answerMessages()
        await model.retry(model.messages[0], using: service)
        #expect(model.messages.map(\.content) == ["Hi", "Answer to Hi"])
        #expect(model.canSend)
        // Sent again with the same client UUID, the server answers only once
        let uuids = backend.requests("POST", Self.streamPath).map { $0.json?["client_uuid"] as? String }
        #expect(uuids.count == 2 && uuids[0] == uuids[1])
    }

    @Test func showsTheAnswerWhileItIsWritten() async throws {
        answerMessages()
        let model = AIChatViewModel(conversation: try conversation())
        let shown = Shown()
        @MainActor func observe() {
            withObservationTracking {
                _ = model.streamingAnswer
            } onChange: {
                Task { @MainActor in
                    shown.answers.append(model.streamingAnswer)
                    observe()
                }
            }
        }
        observe()

        await model.send("Hi", using: service)
        await Task.yield()

        // The typing indicator first (nil), then the growing answer, which the stored answer replaces
        #expect(shown.answers.contains("Answer "))
        #expect(shown.answers.contains("Answer to Hi"))
        #expect(model.streamingAnswer == nil)
        #expect(model.messages.map(\.content) == ["Hi", "Answer to Hi"])
    }

    @Test func loadsTheConversationUntilItHasTheAnswerAfterTheConnectionWasLost() async throws {
        backend.on("POST", Self.streamPath) { request in
            .events(Array(Self.answerEvents(to: request).prefix(2)), failure: URLError(.networkConnectionLost))
        }
        let model = AIChatViewModel(conversation: try conversation(), answerPollInterval: .milliseconds(1))
        let loads = Counter()
        backend.on("GET", "/ai/conversations/3") { [backend] _ in
            let uuid = backend.requests("POST", Self.streamPath).first?.json?["client_uuid"] as? String
            let userMessage = Self.messageJSON(id: 11, role: "user", content: "Hi", clientUUID: uuid)
            // Still answering when it is loaded for the first time
            if loads.next() == 1 {
                return .json(Self.conversationJSON(messages: [userMessage], answerPending: true))
            }
            return .json(Self.conversationJSON(messages: [userMessage, Self.messageJSON(id: 12, role: "assistant", content: "Answer to Hi")]))
        }

        await model.send("Hi", using: service)

        #expect(loads.count == 2)
        #expect(model.messages.map(\.content) == ["Hi", "Answer to Hi"])
        #expect(model.messages.allSatisfy { $0.status == .sent })
        #expect(backend.requests("POST", Self.streamPath).first?.json?["client_uuid"] as? String == model.messages[0].id.uuidString)
        #expect(!model.isWaitingForAnswer)
        #expect(model.canSend)
    }

    @Test func failsTheMessageIfTheServerDoesntHaveItAfterTheConnectionWasLost() async throws {
        backend.on("POST", Self.streamPath) { _ in throw URLError(.networkConnectionLost) }
        backend.on("GET", "/ai/conversations/3") { _ in .json(Self.conversationJSON()) }
        let model = AIChatViewModel(conversation: try conversation(), answerPollInterval: .milliseconds(1))

        await model.send("Hi", using: service)

        #expect(model.messages.map(\.isFailed) == [true])
    }

    @Test func waitsForTheAnswerOfAnEarlierTryInsteadOfFailing() async throws {
        backend.on("POST", Self.streamPath) { _ in .json(#"{"error": "AIAnswerPendingError", "detail": "Still answering."}"#, status: 409) }
        backend.on("GET", "/ai/conversations/3") { [backend] _ in
            let uuid = backend.requests("POST", Self.streamPath).first?.json?["client_uuid"] as? String
            return .json(Self.conversationJSON(messages: [Self.messageJSON(id: 11, role: "user", content: "Hi", clientUUID: uuid), Self.messageJSON(id: 12, role: "assistant", content: "Hello")]))
        }
        let model = AIChatViewModel(conversation: try conversation(), answerPollInterval: .milliseconds(1))

        await model.send("Hi", using: service)

        #expect(model.messages.map(\.content) == ["Hi", "Hello"])
        #expect(model.messages.allSatisfy { $0.status == .sent })
    }

    @Test func loadsAConversationAgainUntilThePendingAnswerIsThere() async throws {
        let loads = Counter()
        backend.on("GET", "/ai/conversations/3") { _ in
            let userMessage = Self.messageJSON(id: 1, role: "user", content: "Hi")
            if loads.next() < 3 {
                return .json(Self.conversationJSON(messages: [userMessage], answerPending: true))
            }
            return .json(Self.conversationJSON(messages: [userMessage, Self.messageJSON(id: 2, role: "assistant", content: "Hello")]))
        }
        let model = AIChatViewModel(conversation: try conversation(), answerPollInterval: .milliseconds(1))

        await model.load(using: service)

        #expect(loads.count == 3)
        #expect(model.messages.map(\.content) == ["Hi", "Hello"])
        #expect(!model.isWaitingForAnswer)
    }

    @Test func stopsLoadingForThePendingAnswerWhenTheChatIsClosed() async throws {
        let loads = Counter()
        backend.on("GET", "/ai/conversations/3") { _ in
            _ = loads.next()
            return .json(Self.conversationJSON(messages: [Self.messageJSON(id: 1, role: "user", content: "Hi")], answerPending: true))
        }
        let model = AIChatViewModel(conversation: try conversation(), answerPollInterval: .milliseconds(20))

        let loading = Task { await model.load(using: service) }
        while loads.count == 0 { await Task.yield() }
        model.close()
        await loading.value

        #expect(loads.count <= 2)
        #expect(!model.isWaitingForAnswer)
        #expect(model.messages.map(\.content) == ["Hi"])
    }

    @Test func discardsAFailedMessage() async throws {
        backend.offline = true
        let model = AIChatViewModel(conversation: try conversation())
        await model.send("Hi", using: service)

        model.discard(model.messages[0])

        #expect(model.messages.isEmpty)
        #expect(model.canSend)
    }

    // MARK: - AIConversationsViewModel

    @Test func loadsRenamesAndDeletesConversations() async throws {
        backend.on("GET", "/ai/conversations") { _ in .json("[\(Self.conversationJSON(id: 3, title: "Legs")),\(Self.conversationJSON(id: 4, title: "Arms"))]") }
        backend.on("PATCH", "/ai/conversations/4") { _ in .json(Self.conversationJSON(id: 4, title: "Biceps")) }
        backend.on("DELETE", "/ai/conversations/3") { _ in Response(status: 204) }
        let model = AIConversationsViewModel()

        await model.load(using: service)
        #expect(model.conversations.map(\.title) == ["Legs", "Arms"])
        #expect(model.hasLoaded)

        await model.rename(model.conversations[1], to: " Biceps ", using: service)
        #expect(model.conversations.map(\.title) == ["Biceps", "Legs"])

        await model.delete(model.conversations[1], using: service)
        #expect(model.conversations.map(\.id) == [4])
        #expect(model.actionError == nil)
    }

    @Test func putsAConversationBackIfTheDeletionFailed() async throws {
        backend.on("GET", "/ai/conversations") { _ in .json("[\(Self.conversationJSON(id: 3)),\(Self.conversationJSON(id: 4))]") }
        backend.on("DELETE", "/ai/conversations/3") { _ in .json(#"{"detail": "Server down"}"#, status: 500) }
        let model = AIConversationsViewModel()
        await model.load(using: service)

        await model.delete(model.conversations[0], using: service)

        #expect(model.conversations.map(\.id) == [3, 4])
        #expect(model.actionError != nil)
    }

    @Test func doesntRenameToAnEmptyOrTheSameTitle() async throws {
        let model = AIConversationsViewModel()
        let legs = try conversation()

        await model.rename(legs, to: "  ", using: service)
        await model.rename(legs, to: "Leg day", using: service)

        #expect(backend.paths.isEmpty)
    }

    typealias Response = StubURLProtocol.Response
}

/// Counts the requests of a route, which are handled outside of the main actor
private final class Counter: @unchecked Sendable {
    private let lock = NSLock()
    private var value = 0

    var count: Int { lock.withLock { value } }

    func next() -> Int {
        lock.withLock {
            value += 1
            return value
        }
    }
}

/// The values of `streamingAnswer` a test has seen
@MainActor
private final class Shown {
    var answers: [String?] = []
}
