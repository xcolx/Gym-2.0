//
//  APIClientTests.swift
//  Gym 2.0Tests
//
//  Created by Colin Rüegg on 21.10.2026.
//
//  The requests, responses and errors of APIClient against a stubbed backend.
//  Mirrors web/src/lib/api/errors.test.ts and the date parsing of web/src/lib/api/mapping.test.ts
//

import Foundation
import Testing
@testable import Gym_2_0

final class RequestLog: @unchecked Sendable {
    private let lock = NSLock()
    private var stored: [StubURLProtocol.Request] = []

    func append(_ request: StubURLProtocol.Request) {
        lock.withLock { stored.append(request) }
    }

    var requests: [StubURLProtocol.Request] {
        lock.withLock { stored }
    }
}

@MainActor
struct APIClientTests {

    /// Answers every request with the response and records the requests
    func client(_ response: StubURLProtocol.Response, log: RequestLog = RequestLog()) -> APIClient {
        StubURLProtocol.client { request in
            log.append(request)
            return response
        }
    }

    func serverError(_ error: APIError) -> (status: Int, code: String?, message: String)? {
        guard case let .server(status, code, message) = error else { return nil }
        return (status, code, message)
    }

    func error(for response: StubURLProtocol.Response) async -> APIError? {
        do {
            try await client(response).send(Endpoint(method: .get, path: "/anything"))
            return nil
        } catch {
            return error as? APIError
        }
    }

    // MARK: Requests

    @Test func sendsJSONInSnakeCaseWithoutNilsAndWithISODates() async throws {
        let log = RequestLog()
        let workoutUUID = UUID()
        let request = NewWorkout(
            clientUuid: workoutUUID,
            name: "Legs",
            date: isoDate("2026-10-15T08:30:00Z"),
            duration: 60,
            inProgress: false,
            exercises: [WorkoutExerciseDraft(exerciseId: 7, index: 0, reps: [5], weights: [100])]
        )
        try await client(.json("{}"), log: log).send(Endpoint(method: .post, path: "/workouts", body: .json(request)))

        let sent = try #require(log.requests.first)
        #expect(sent.method == "POST")
        #expect(sent.path == "/workouts")
        #expect(sent.headers["Content-Type"] == "application/json")
        #expect(sent.headers["Accept"] == "application/json")
        let json = try #require(sent.json)
        #expect(json["client_uuid"] as? String == workoutUUID.uuidString)
        #expect(json["in_progress"] as? Bool == false)
        #expect(json["date"] as? String == "2026-10-15T08:30:00Z")
        let exercise = try #require((json["exercises"] as? [[String: Any]])?.first)
        #expect(exercise["exercise_id"] as? Int == 7)
        #expect(exercise["reps"] as? [Int] == [5])
        // nil is left out, not sent as null
        #expect(exercise["time"] == nil)
        #expect(exercise["client_uuid"] == nil)
        #expect(Set(exercise.keys) == ["exercise_id", "unilateral", "index", "reps", "weights"])
    }

    @Test func flattensTheWorkoutFieldsAndTheExerciseChangesOfTheBatchUpdate() async throws {
        let log = RequestLog()
        let exerciseUUID = UUID()
        let body = WorkoutBatchUpdate(
            workout: WorkoutUpdate(name: "Legs", inProgress: false),
            exerciseChanges: [
                .create(WorkoutExerciseDraft(clientUuid: exerciseUUID, exerciseId: 7, index: 2, reps: [1])),
                .update(id: 345, WorkoutExerciseUpdate(index: 1, reps: [8, 8])),
            ]
        )
        try await client(.json("{}"), log: log).send(Endpoint(method: .patch, path: "/workouts/3", body: .json(body)))
        let json = try #require(log.requests.first?.json)
        #expect(json["name"] as? String == "Legs")
        #expect(json["in_progress"] as? Bool == false)
        // Fields that aren't set are left out
        #expect(Set(json.keys) == ["name", "in_progress", "exercise_changes"])

        let changes = try #require(json["exercise_changes"] as? [[String: Any]])
        #expect(changes.count == 2)
        #expect(changes[0]["op"] as? String == "create")
        #expect(changes[0]["client_uuid"] as? String == exerciseUUID.uuidString)
        #expect(changes[0]["exercise_id"] as? Int == 7)
        #expect(changes[0]["index"] as? Int == 2)
        #expect(changes[0]["workout_id"] == nil)
        #expect(Set(changes[0].keys) == ["op", "client_uuid", "exercise_id", "unilateral", "index", "reps"])
        #expect(changes[1]["op"] as? String == "update")
        #expect(changes[1]["id"] as? Int == 345)
        #expect(changes[1]["index"] as? Int == 1)
        #expect(changes[1]["reps"] as? [Int] == [8, 8])
        #expect(Set(changes[1].keys) == ["op", "id", "index", "reps"])
    }

    @Test func sendsOnlyTheExerciseChangesWhenTheWorkoutIsUnchanged() async throws {
        let log = RequestLog()
        let body = WorkoutBatchUpdate(workout: nil, exerciseChanges: [.update(id: 1, WorkoutExerciseUpdate(weights: [50]))])
        try await client(.json("{}"), log: log).send(Endpoint(method: .patch, path: "/workouts/3", body: .json(body)))
        let json = try #require(log.requests.first?.json)
        #expect(Set(json.keys) == ["exercise_changes"])
    }

    @Test func decodesTheExerciseChangesByTheirOp() throws {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let json = #"""
            {"duration": 60, "exercise_changes": [
                {"op": "create", "exercise_id": 12, "unilateral": false, "index": 0, "reps": [10], "weights": [50.0]},
                {"op": "update", "id": 345, "index": 1, "reps": [8, 8]}
            ]}
            """#
        let body = try decoder.decode(WorkoutBatchUpdate.self, from: Data(json.utf8))
        #expect(body.workout == WorkoutUpdate(duration: 60))
        #expect(body.exerciseChanges == [
            .create(WorkoutExerciseDraft(exerciseId: 12, index: 0, reps: [10], weights: [50])),
            .update(id: 345, WorkoutExerciseUpdate(index: 1, reps: [8, 8])),
        ])
    }

    @Test func encodesAPlusInTheQuerySoThatTheServerDoesntReadASpace() async throws {
        let log = RequestLog()
        let endpoint = Endpoint(method: .get, path: "/workouts/delta", queryItems: [URLQueryItem(name: "last_sync_time", value: "2026-10-15T08:30:00.123456+00:00")])
        try await client(.json("{}"), log: log).send(endpoint)
        let query = try #require(log.requests.first?.url.query(percentEncoded: true))
        #expect(query == "last_sync_time=2026-10-15T08:30:00.123456%2B00:00")
    }

    @Test func usesTheTimeoutOfTheEndpoint() async throws {
        let log = RequestLog()
        let api = client(.json("{}"), log: log)
        try await api.send(Endpoint(method: .post, path: "/ai/conversations/1/messages", timeout: 100))
        try await api.send(Endpoint(method: .get, path: "/users/me"))
        #expect(log.requests.first?.timeout == 100)
        #expect(log.requests.last?.timeout != 100)
    }

    // MARK: Responses

    @Test func parsesTheDatesOfTheServerAlsoWithMicroseconds() async throws {
        let api = client(.json(#"""
            [
                {"id": 1, "name": "A", "date": "2026-10-15T08:30:00.123456+00:00", "duration": 30, "in_progress": false, "exercises": []},
                {"id": 2, "name": "B", "date": "2026-10-15T10:30:00+02:00", "duration": 30, "in_progress": true, "exercises": []},
                {"id": 3, "name": "C", "date": "2026-10-15T08:30:00Z", "duration": 30, "in_progress": false, "exercises": []}
            ]
            """#))
        let workouts = try await api.send(Endpoint(method: .get, path: "/workouts"), as: [WorkoutDTO].self)
        #expect(abs(workouts[0].date.timeIntervalSince(isoDate("2026-10-15T08:30:00Z")) - 0.123456) < 0.001)
        #expect(workouts[1].date == isoDate("2026-10-15T08:30:00Z"))
        #expect(workouts[2].date == isoDate("2026-10-15T08:30:00Z"))
        #expect(workouts[1].inProgress)
    }

    @Test func failsWithADecodingErrorForAnInvalidDateOrBody() async throws {
        for body in [#"{"id": 1, "name": "A", "date": "yesterday", "duration": 30, "in_progress": false, "exercises": []}"#, "<html>", #"{"id": "1"}"#] {
            let error = await #expect(throws: APIError.self) {
                _ = try await client(.json(body)).send(Endpoint(method: .get, path: "/workout"), as: WorkoutDTO.self)
            }
            guard case .decoding = error else {
                Issue.record("Expected a decoding error for \(body), got \(String(describing: error))")
                continue
            }
            #expect(error?.localizedDescription == "Received an unexpected response from the server.")
        }
    }

    @Test func returnsTheRawData() async throws {
        let data = Data([0xFF, 0xD8, 0xFF])
        let api = client(StubURLProtocol.Response(headers: ["Content-Type": "image/jpeg"], body: data))
        #expect(try await api.data(Endpoint(method: .get, path: "/images/abc")) == data)
    }

    // MARK: Errors

    @Test func readsAppErrors() async throws {
        let error = try #require(await error(for: .json(#"{"error": "EmailVerificationError", "detail": "Verify first"}"#, status: 403)))
        let server = try #require(serverError(error))
        #expect(server.status == 403 && server.code == "EmailVerificationError" && server.message == "Verify first")
        #expect(error.errorDescription == "Verify first")
        #expect(error.status == 403)
        #expect(error.isRejection)
    }

    @Test func readsHTTPExceptionsValidationErrorsAndRateLimits() async throws {
        let notFound = try #require(await error(for: .json(#"{"detail": "Not Found"}"#, status: 404)))
        let notFoundServer = try #require(serverError(notFound))
        #expect(notFoundServer.status == 404 && notFoundServer.code == nil && notFoundServer.message == "Not Found")

        let validation = try #require(await error(for: .json(#"{"detail": [{"msg": "Value error, Bad name", "loc": ["body", "name"]}, {"msg": "Too long"}]}"#, status: 422)))
        let validationServer = try #require(serverError(validation))
        #expect(validationServer.status == 422 && validationServer.code == nil && validationServer.message == "Bad name\nToo long")

        let rateLimit = try #require(await error(for: .json(#"{"error": "Rate limit exceeded: 5 per 1 minute"}"#, status: 429)))
        let rateLimitServer = try #require(serverError(rateLimit))
        #expect(rateLimitServer.status == 429 && rateLimitServer.code == nil && rateLimitServer.message == "Rate limit exceeded: 5 per 1 minute")
        #expect(!rateLimit.isRejection)
    }

    @Test func fallsBackToTheStatusTextForOtherBodies() async throws {
        let error = try #require(await error(for: StubURLProtocol.Response(status: 500, headers: ["Content-Type": "text/html"], body: Data("<html>".utf8))))
        let server = try #require(serverError(error))
        #expect(server.status == 500 && server.code == nil)
        #expect(server.message == HTTPURLResponse.localizedString(forStatusCode: 500).capitalized)
        #expect(!error.isRejection)
    }

    @Test func treatsA401AsTheEndOfTheSession() async throws {
        let error = try #require(await error(for: .json(#"{"detail": "Not authenticated"}"#, status: 401)))
        guard case .unauthorized(let message) = error else {
            Issue.record("Unexpected error \(error)")
            return
        }
        #expect(message == "Not authenticated")
        #expect(error.status == 401)
        #expect(!error.isRejection)
    }

    @Test func reportsARetiredAPIVersion() async throws {
        var updateRequired = false
        let api = client(.json(#"{"error": "ApiVersionRetiredError", "detail": "Please update the app."}"#, status: 410))
        api.onUpdateRequired = { updateRequired = true }
        let error = await #expect(throws: APIError.self) {
            try await api.send(Endpoint(method: .get, path: "/users/me"))
        }
        guard case .updateRequired(let message) = error else {
            Issue.record("Unexpected error \(String(describing: error))")
            return
        }
        #expect(message == "Please update the app.")
        #expect(error?.status == 410)
        #expect(error?.isRejection == false)
        #expect(updateRequired)
    }

    @Test func reportsADeprecatedAPIVersion() async throws {
        var updateAvailable = false
        let api = client(.json("{}", headers: ["Deprecation": "true"]))
        api.onUpdateAvailable = { updateAvailable = true }
        try await api.send(Endpoint(method: .get, path: "/users/me"))
        #expect(updateAvailable)
    }

    @Test func reportsAMissingConnectionAsTransportError() async throws {
        let api = StubURLProtocol.client { _ in throw URLError(.notConnectedToInternet) }
        let error = await #expect(throws: APIError.self) {
            try await api.send(Endpoint(method: .get, path: "/users/me"))
        }
        guard case .transport(let urlError) = error else {
            Issue.record("Unexpected error \(String(describing: error))")
            return
        }
        #expect(urlError.code == .notConnectedToInternet)
        #expect(error?.localizedDescription == "Could not reach the server. Please check your internet connection.")
        #expect(error?.status == nil)
        #expect(error?.isRejection == false)
    }
}

struct APIErrorTests {

    @Test func treats4xxExceptTimeoutsAndRateLimitsAsRejections() {
        #expect(APIError.server(status: 400, code: nil, message: "").isRejection)
        #expect(APIError.server(status: 404, code: nil, message: "").isRejection)
        #expect(!APIError.server(status: 408, code: nil, message: "").isRejection)
        #expect(!APIError.server(status: 429, code: nil, message: "").isRejection)
        #expect(!APIError.server(status: 500, code: nil, message: "").isRejection)
        #expect(!APIError.transport(URLError(.timedOut)).isRejection)
        #expect(!APIError.updateRequired(message: "").isRejection)
        #expect(!APIError.invalidResponse.isRejection)
        #expect(!CocoaError(.fileNoSuchFile).isRejection)
        #expect(APIError.updateRequired(message: "").status == 410)
        #expect(APIError.invalidResponse.status == nil)
    }

    @Test func decodesTheErrorBodies() throws {
        func body(_ json: String) throws -> APIErrorBody {
            try JSONDecoder().decode(APIErrorBody.self, from: Data(json.utf8))
        }
        let app = try body(#"{"error": "EmailVerificationError", "detail": "Verify first"}"#)
        #expect(app.message == "Verify first")
        #expect(app.code == "EmailVerificationError")
        let http = try body(#"{"detail": "Not authenticated"}"#)
        #expect(http.message == "Not authenticated")
        #expect(http.code == nil)
        let validation = try body(#"{"detail": [{"msg": "Value error, Bad name"}, {"msg": "Too long"}]}"#)
        #expect(validation.message == "Bad name\nToo long")
        #expect(validation.code == nil)
        let rateLimit = try body(#"{"error": "Rate limit exceeded: 5 per 1 minute"}"#)
        #expect(rateLimit.message == "Rate limit exceeded: 5 per 1 minute")
        #expect(rateLimit.code == nil)
        #expect(try body("{}").message == nil)
    }
}
