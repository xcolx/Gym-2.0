//
//  WorkoutSchemeDTOs.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 04.10.2026.
//

import Foundation

// Mirrors backend/app/schemas/workout_schemes.py

// MARK: - Responses

struct WorkoutSchemeDTO: Decodable, Identifiable, Equatable {
    let id: Int
    /// The UUID sent when creating it, only for objects of the current user. Used to match a create whose response was lost.
    let clientUuid: UUID?
    let name: String
    /// When a workout based on this scheme was last started.
    let lastPerformed: Date?
    /// Ordered by index.
    let exercises: [WorkoutSchemeExerciseDTO]
}

struct WorkoutSchemeExerciseDTO: Decodable, Identifiable, Equatable {
    let id: Int
    let exerciseId: Int
    let index: Int
}

struct WorkoutSchemeListDTO: Decodable {
    let schemes: [WorkoutSchemeDTO]
    /// Pass to `WorkoutSchemeService.changes(since:)` for the next sync. Kept as the server sent it to not lose precision.
    let syncTime: String
}

struct WorkoutSchemeDeltaDTO: Decodable {
    let updates: [WorkoutSchemeChangeDTO]
    let syncTime: String
}

/// One changed scheme. Created and updated should both be treated as an upsert that replaces the complete
/// exercise list, and deletions of unknown IDs ignored, because a change can be delivered more than once.
struct WorkoutSchemeChangeDTO: Decodable {
    enum Action: Int, Decodable {
        case created = 0
        case updated = 1
        case deleted = 2
    }

    let id: Int
    let action: Action
    /// The scheme as it is now, with all its exercises. Nil for deletions, the backend only sends the ID then.
    let scheme: WorkoutSchemeDTO?

    private enum CodingKeys: String, CodingKey {
        case id, action
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(Int.self, forKey: .id)
        action = try container.decode(Action.self, forKey: .action)
        scheme = action == .deleted ? nil : try WorkoutSchemeDTO(from: decoder)
    }
}

// MARK: - Requests

struct NewWorkoutScheme: Encodable, Equatable {
    /// If a scheme with this UUID already exists, it is returned instead of creating it again.
    var clientUuid: UUID?
    /// 1 to 25 characters.
    var name: String
    /// Their indexes must be exactly 0..<count.
    var exercises: [WorkoutSchemeExerciseDraft]
}

struct WorkoutSchemeExerciseDraft: Encodable, Equatable {
    var exerciseId: Int
    var index: Int
}

/// Only the fields that are set are changed. `exercises` replaces the complete list.
struct WorkoutSchemeUpdate: Encodable, Equatable {
    var name: String?
    var exercises: [WorkoutSchemeExerciseDraft]?
}
