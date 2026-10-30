//
//  FakeBackend.swift
//  Gym 2.0Tests
//
//  Created by Colin Rüegg on 21.10.2026.
//
//  A minimal backend for the sync, served through StubURLProtocol. Every route answers like an empty account
//  unless a test replaces it.
//

import Foundation
@testable import Gym_2_0

final class FakeBackend: @unchecked Sendable {
    typealias Request = StubURLProtocol.Request
    typealias Response = StubURLProtocol.Response
    typealias Route = (Request) throws -> Response

    private let lock = NSLock()
    private var routes: [String: Route] = [:]
    private var log: [Request] = []
    private var isOffline = false

    static let userJSON = """
        {"id": 1, "username": "tester", "email": "tester@example.com", "profile_image_url": "", "profile_icon_url": "",
         "bodyweight": 80, "scheme_color": null, "weight_unit": 0, "distance_unit": 0, "language": "en",
         "created_at": "2026-01-01T00:00:00+00:00"}
        """

    static func exerciseJSON(id: Int, name: String) -> String {
        """
        {"id": \(id), "client_uuid": null, "name": "\(name)", "aliases": [], "description": null, "image_urls": [],
         "muscle_group_id": 1, "equipment_id": 1, "verified": true, "reps": true, "weights": true, "time": false,
         "intensity": false, "distance": false, "primary_muscle_ids": [], "secondary_muscle_ids": []}
        """
    }

    struct WorkoutExerciseJSON {
        var id: Int
        var clientUUID: String? = nil
        var exerciseId: Int
        var index: Int
        var reps: [Int]
        var weights: [Double]
    }

    static func workoutJSON(id: Int, clientUUID: String?, name: String, date: String = "2026-10-15T08:00:00+00:00", duration: Int = 45, exercises: [WorkoutExerciseJSON]) -> String {
        let exercises = exercises.map { exercise in
            """
            {"id": \(exercise.id), "client_uuid": \(exercise.clientUUID.map { "\"\($0)\"" } ?? "null"), "exercise_id": \(exercise.exerciseId),
             "unilateral": false, "index": \(exercise.index), "reps": \(exercise.reps), "weights": \(exercise.weights),
             "time": null, "intensity": null, "distance": null}
            """
        }
        return """
            {"id": \(id), "client_uuid": \(clientUUID.map { "\"\($0)\"" } ?? "null"), "name": "\(name)", "date": "\(date)",
             "duration": \(duration), "in_progress": false, "exercises": [\(exercises.joined(separator: ","))]}
            """
    }

    init(exercises: [String] = [exerciseJSON(id: 7, name: "Squat")]) {
        on("POST", "/auth/login/email") { _ in .json(#"{"message": "Logged in"}"#) }
        on("GET", "/users/me") { _ in .json(Self.userJSON) }
        on("GET", "/users/me/friends") { _ in .json("[]") }
        on("GET", "/users/me/blocked-users") { _ in .json("[]") }
        on("GET", "/exercises/muscles") { _ in .json("[]") }
        on("GET", "/exercises/muscle-groups") { _ in .json("[]") }
        on("GET", "/exercises/equipment") { _ in .json("[]") }
        on("GET", "/exercises") { _ in .json(#"{"exercises": [\#(exercises.joined(separator: ","))], "sync_time": "t1"}"#) }
        on("GET", "/workout-schemes") { _ in .json(#"{"schemes": [], "sync_time": "t1"}"#) }
        on("GET", "/chats") { _ in .json(#"{"chats": [], "sync_time": "t1"}"#) }
        serveWorkouts([])
    }

    func on(_ method: String, _ path: String, _ route: @escaping Route) {
        lock.withLock { routes["\(method) \(path)"] = route }
    }

    /// The workouts GET /workouts returns
    func serveWorkouts(_ workouts: [String]) {
        on("GET", "/workouts") { _ in .json(#"{"workouts": [\#(workouts.joined(separator: ","))], "sync_time": "t1"}"#) }
    }

    /// A workout stored on the fake server
    struct StoredWorkout {
        var id: Int
        var clientUUID: String? = nil
        var name: String
        var duration: Int = 45
        var exercises: [WorkoutExerciseJSON]

        var json: String {
            FakeBackend.workoutJSON(id: id, clientUUID: clientUUID, name: name, duration: duration, exercises: exercises)
        }
    }

    /// Serves the workout with GET /workouts and changes it with PATCH /workouts/{id} like the backend: the workout
    /// fields first, then the exercise changes in order (a create is inserted at its index and returns the existing
    /// exercise for a known client UUID, an update moves the exercise to its index), all or nothing. An update of an
    /// unknown exercise fails with 404 WorkoutExerciseNotFoundError. New exercises get the ids from 1000 on.
    /// Returns the current state of the workout on the server.
    @discardableResult
    func storeWorkout(_ workout: StoredWorkout) -> () -> StoredWorkout {
        var stored = workout
        var nextExerciseId = 1000
        let state = NSLock()
        serveWorkouts([workout.json])
        on("PATCH", "/workouts/\(workout.id)") { [weak self] request in
            let json = request.json ?? [:]
            let response: Response = try state.withLock {
                var changed = stored
                var nextId = nextExerciseId
                if let name = json["name"] as? String { changed.name = name }
                if let duration = json["duration"] as? Int { changed.duration = duration }
                for change in json["exercise_changes"] as? [[String: Any]] ?? [] {
                    var exercises = changed.exercises.sorted { $0.index < $1.index }
                    let index = change["index"] as? Int
                    switch change["op"] as? String {
                    case "create":
                        let clientUUID = change["client_uuid"] as? String
                        guard clientUUID == nil || !exercises.contains(where: { $0.clientUUID == clientUUID }) else { continue }
                        let exercise = WorkoutExerciseJSON(id: nextId, clientUUID: clientUUID, exerciseId: change["exercise_id"] as? Int ?? 0, index: 0, reps: change["reps"] as? [Int] ?? [], weights: change["weights"] as? [Double] ?? [])
                        nextId += 1
                        exercises.insert(exercise, at: min(index ?? exercises.count, exercises.count))
                    case "update":
                        guard let position = exercises.firstIndex(where: { $0.id == change["id"] as? Int }) else {
                            return .json(#"{"error": "WorkoutExerciseNotFoundError", "detail": "Workout exercise not found"}"#, status: 404)
                        }
                        var exercise = exercises.remove(at: position)
                        if let exerciseId = change["exercise_id"] as? Int { exercise.exerciseId = exerciseId }
                        if let reps = change["reps"] as? [Int] { exercise.reps = reps }
                        if let weights = change["weights"] as? [Double] { exercise.weights = weights }
                        exercises.insert(exercise, at: min(index ?? position, exercises.count))
                    default:
                        return .json(#"{"detail": "Invalid op"}"#, status: 422)
                    }
                    changed.exercises = exercises.enumerated().map { position, exercise in
                        var exercise = exercise
                        exercise.index = position
                        return exercise
                    }
                }
                stored = changed
                nextExerciseId = nextId
                return .json(changed.json)
            }
            if response.status == 200 {
                self?.serveWorkouts([state.withLock { stored.json }])
            }
            return response
        }
        return { state.withLock { stored } }
    }

    var offline: Bool {
        get { lock.withLock { isOffline } }
        set { lock.withLock { isOffline = newValue } }
    }

    func requests(_ method: String, _ path: String) -> [Request] {
        lock.withLock { log.filter { $0.method == method && $0.path == path } }
    }

    var paths: [String] {
        lock.withLock { log.map { "\($0.method) \($0.path)" } }
    }

    func handle(_ request: Request) throws -> Response {
        let route: Route? = try lock.withLock {
            log.append(request)
            if isOffline { throw URLError(.notConnectedToInternet) }
            return routes["\(request.method) \(request.path)"]
        }
        guard let route else {
            return .json(#"{"detail": "Not Found"}"#, status: 404)
        }
        return try route(request)
    }
}
