//
//  ServerSentEventsTests.swift
//  Gym 2.0Tests
//
//  Created by Colin Rüegg on 16.11.2026.
//
//  Reading the events of a streamed response, as the backend sends them for the answers of the AI
//

import Foundation
import Testing
@testable import Gym_2_0

@Suite struct ServerSentEventsTests {

    func events(in lines: [String]) -> [ServerSentEvent] {
        var parser = ServerSentEventParser()
        return lines.compactMap { parser.event(completedBy: $0) }
    }

    @Test func readsAnEventFromItsNameAndDataLine() {
        let events = events(in: ["event: delta", #"data: {"content": "a: b"}"#, ": ping", "event: done", "data:{}"])

        #expect(events == [
            ServerSentEvent(event: "delta", data: Data(#"{"content": "a: b"}"#.utf8)),
            ServerSentEvent(event: "done", data: Data("{}".utf8)),
        ])
    }

    @Test func namesAnEventWithoutNameMessage() {
        let events = events(in: ["event: start", "data: 1", "data: 2", "id: 7", "retry"])

        #expect(events.map(\.event) == ["start", "message"])
    }

    @Test func streamsTheEventsOfAResponse() async throws {
        let api = StubURLProtocol.client { request in
            #expect(request.headers["Accept"] == "text/event-stream")
            return .events([("start", "1"), ("delta", "2")])
        }

        var events: [ServerSentEvent] = []
        for try await event in try await api.events(Endpoint(method: .post, path: "/stream")) {
            events.append(event)
        }

        #expect(events == [ServerSentEvent(event: "start", data: Data("1".utf8)), ServerSentEvent(event: "delta", data: Data("2".utf8))])
    }

    @Test func failsWithTheErrorOfTheServerBeforeTheStreamStarts() async throws {
        let api = StubURLProtocol.client { _ in .json(#"{"error": "AIAnswerPendingError", "detail": "Still answering."}"#, status: 409) }

        do {
            _ = try await api.events(Endpoint(method: .post, path: "/stream"))
            Issue.record("Expected an error")
        } catch APIError.server(let status, let code, let message) {
            #expect(status == 409 && code == "AIAnswerPendingError" && message == "Still answering.")
        }
    }

    @Test func reportsALostConnectionAsTransportError() async throws {
        let api = StubURLProtocol.client { _ in .events([("start", "1")], failure: URLError(.networkConnectionLost)) }

        // The events that arrived before may be read or not, the error can overtake them
        do {
            for try await _ in try await api.events(Endpoint(method: .post, path: "/stream")) {}
            Issue.record("Expected an error")
        } catch APIError.transport(let error) {
            #expect(error.code == .networkConnectionLost)
        }
    }
}
