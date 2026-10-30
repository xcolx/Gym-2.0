//
//  WorkoutService.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 04.10.2026.
//

import Foundation

/// The current user's workouts against /workouts. Workouts in progress are synced like finished ones, so they can be
/// continued on another device. A workout is finished or continued with `update`.
final class WorkoutService {
    private let api: APIClient

    init(api: APIClient) {
        self.api = api
    }

    /// All workouts, for the first sync. Use `changes(since:)` with the returned sync time afterwards.
    func all() async throws -> WorkoutListDTO {
        try await api.send(.allWorkouts)
    }

    /// The workouts created, updated or deleted since the sync time of the previous `all()` or `changes(since:)`.
    func changes(since syncTime: String) async throws -> WorkoutDeltaDTO {
        try await api.send(.workoutChanges(since: syncTime))
    }

    func create(_ workout: NewWorkout) async throws -> WorkoutDTO {
        try await api.send(.createWorkout(workout))
    }

    /// Changes the fields of `update` that are set (nil leaves the workout as it is) and then applies the exercise
    /// changes in order, in one request and all or nothing. Returns the workout with all its exercises, the created
    /// ones can be matched by their client UUID.
    func update(id: Int, with update: WorkoutUpdate?, exerciseChanges: [WorkoutExerciseChange] = []) async throws -> WorkoutDTO {
        try await api.send(.updateWorkout(id: id, WorkoutBatchUpdate(workout: update, exerciseChanges: exerciseChanges)))
    }

    func delete(id: Int) async throws {
        try await api.send(.deleteWorkout(id: id))
    }

    // MARK: - Workout exercises

    /// Exercises are created and changed with `update(id:with:exerciseChanges:)`, only deleted on their own.
    func deleteExercise(id: Int) async throws {
        try await api.send(.deleteWorkoutExercise(id: id))
    }
}

private extension Endpoint {
    static let allWorkouts = Endpoint(method: .get, path: "/workouts")

    static func workoutChanges(since syncTime: String) -> Endpoint {
        Endpoint(method: .get, path: "/workouts/delta", queryItems: [URLQueryItem(name: "last_sync_time", value: syncTime)])
    }

    static func createWorkout(_ workout: NewWorkout) -> Endpoint {
        Endpoint(method: .post, path: "/workouts", body: .json(workout))
    }

    static func updateWorkout(id: Int, _ update: WorkoutBatchUpdate) -> Endpoint {
        Endpoint(method: .patch, path: "/workouts/\(id)", body: .json(update))
    }

    static func deleteWorkout(id: Int) -> Endpoint {
        Endpoint(method: .delete, path: "/workouts/\(id)")
    }

    static func deleteWorkoutExercise(id: Int) -> Endpoint {
        Endpoint(method: .delete, path: "/workout-exercises/\(id)")
    }
}
