//
//  ServerSentEvents.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 16.11.2026.
//

import Foundation

/// One event of a text/event-stream response, e.g. a part of the answer of the Gym-AI.
struct ServerSentEvent: Equatable {
    /// The name of the event, "message" if the server sent none
    let event: String
    let data: Data
}

/// Reads the events from the lines of a text/event-stream.
///
/// `URLSession.AsyncBytes.lines` leaves out the empty lines that end an event, so an event ends with its data line
/// instead: the backend sends the name of an event right before its data, which is a single line.
struct ServerSentEventParser {
    private var event = "message"

    /// The event that is complete with this line. Comments (lines starting with a colon) and unknown fields are skipped.
    mutating func event(completedBy line: String) -> ServerSentEvent? {
        guard !line.hasPrefix(":"), let colon = line.firstIndex(of: ":") else { return nil }
        var value = line[line.index(after: colon)...]
        if value.hasPrefix(" ") {
            value = value.dropFirst()
        }

        switch line[..<colon] {
        case "event":
            event = String(value)
            return nil
        case "data":
            defer { event = "message" }
            return ServerSentEvent(event: event, data: Data(value.utf8))
        default:
            return nil
        }
    }
}

/// The events of a streamed response, each as soon as it has arrived. A connection that is lost while reading throws
/// `APIError.transport`. Cancelling the task that reads closes the connection.
struct ServerSentEvents: AsyncSequence {
    typealias Element = ServerSentEvent

    let bytes: URLSession.AsyncBytes

    func makeAsyncIterator() -> AsyncIterator {
        AsyncIterator(lines: bytes.lines.makeAsyncIterator())
    }

    struct AsyncIterator: AsyncIteratorProtocol {
        var lines: AsyncLineSequence<URLSession.AsyncBytes>.AsyncIterator
        private var parser = ServerSentEventParser()

        init(lines: AsyncLineSequence<URLSession.AsyncBytes>.AsyncIterator) {
            self.lines = lines
        }

        mutating func next() async throws -> ServerSentEvent? {
            do {
                while let line = try await lines.next() {
                    if let event = parser.event(completedBy: line) {
                        return event
                    }
                }
                return nil
            } catch let error as URLError {
                throw APIError.transport(error)
            }
        }
    }
}
