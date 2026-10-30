//
//  WorkoutSchemeService.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 04.10.2026.
//

import Foundation

/// The current user's workout schemes (workout templates) against /workout-schemes.
final class WorkoutSchemeService {
    private let api: APIClient

    init(api: APIClient) {
        self.api = api
    }

    /// All schemes, for the first sync. Use `changes(since:)` with the returned sync time afterwards.
    func all() async throws -> WorkoutSchemeListDTO {
        try await api.send(.allWorkoutSchemes)
    }

    /// The schemes created, updated or deleted since the sync time of the previous `all()` or `changes(since:)`.
    func changes(since syncTime: String) async throws -> WorkoutSchemeDeltaDTO {
        try await api.send(.workoutSchemeChanges(since: syncTime))
    }

    func create(_ scheme: NewWorkoutScheme) async throws -> WorkoutSchemeDTO {
        try await api.send(.createWorkoutScheme(scheme))
    }

    func update(id: Int, with update: WorkoutSchemeUpdate) async throws -> WorkoutSchemeDTO {
        try await api.send(.updateWorkoutScheme(id: id, update))
    }

    /// Sets the last performed date to now. Call this when a workout based on the scheme is started.
    func markPerformed(id: Int) async throws -> WorkoutSchemeDTO {
        try await api.send(.markWorkoutSchemePerformed(id: id))
    }

    func delete(id: Int) async throws {
        try await api.send(.deleteWorkoutScheme(id: id))
    }
}

private extension Endpoint {
    static let allWorkoutSchemes = Endpoint(method: .get, path: "/workout-schemes")

    static func workoutSchemeChanges(since syncTime: String) -> Endpoint {
        Endpoint(method: .get, path: "/workout-schemes/delta", queryItems: [URLQueryItem(name: "last_sync_time", value: syncTime)])
    }

    static func createWorkoutScheme(_ scheme: NewWorkoutScheme) -> Endpoint {
        Endpoint(method: .post, path: "/workout-schemes", body: .json(scheme))
    }

    static func updateWorkoutScheme(id: Int, _ update: WorkoutSchemeUpdate) -> Endpoint {
        Endpoint(method: .patch, path: "/workout-schemes/\(id)", body: .json(update))
    }

    static func markWorkoutSchemePerformed(id: Int) -> Endpoint {
        Endpoint(method: .post, path: "/workout-schemes/\(id)/performances")
    }

    static func deleteWorkoutScheme(id: Int) -> Endpoint {
        Endpoint(method: .delete, path: "/workout-schemes/\(id)")
    }
}
