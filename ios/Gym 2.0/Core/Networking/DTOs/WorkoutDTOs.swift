//
//  WorkoutDTOs.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 04.10.2026.
//

import Foundation

// Mirrors backend/app/schemas/workouts.py
//
// Sets are stored per metric: reps[i], weights[i], ... belong to set i. A metric the exercise doesn't track is nil,
// a tracked metric has a value for every set.

// MARK: - Responses

struct WorkoutDTO: Decodable, Identifiable, Equatable {
    let id: Int
    /// The UUID sent when creating it, only for objects of the current user. Used to match a create whose response was lost.
    let clientUuid: UUID?
    let name: String
    let date: Date
    /// In minutes.
    let duration: Int
    let inProgress: Bool
    /// Ordered by index.
    let exercises: [WorkoutExerciseDTO]
}

struct WorkoutExerciseDTO: Decodable, Identifiable, Equatable {
    let id: Int
    /// The UUID sent when creating it, only for objects of the current user. Used to match a create whose response was lost.
    let clientUuid: UUID?
    let exerciseId: Int
    let unilateral: Bool
    let index: Int

    let reps: [Int]?
    let weights: [Double]?
    /// In seconds.
    let time: [Int]?
    let intensity: [Double]?
    /// In meters.
    let distance: [Double]?
}

struct WorkoutListDTO: Decodable {
    let workouts: [WorkoutDTO]
    /// Pass to `WorkoutService.changes(since:)` for the next sync. Kept as the server sent it to not lose precision.
    let syncTime: String
}

struct WorkoutDeltaDTO: Decodable {
    let updates: [WorkoutChangeDTO]
    let syncTime: String
}

/// One changed workout. Created and updated should both be treated as an upsert, and deletions of unknown IDs
/// ignored, because a change can be delivered more than once.
struct WorkoutChangeDTO: Decodable {
    enum Action: Int, Decodable {
        case created = 0
        case updated = 1
        case deleted = 2
    }

    let id: Int
    let action: Action
    /// The workout as it is now. Nil for deletions, the backend only sends the ID then.
    let workout: WorkoutDTO?

    private enum CodingKeys: String, CodingKey {
        case id, action
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(Int.self, forKey: .id)
        action = try container.decode(Action.self, forKey: .action)
        workout = action == .deleted ? nil : try WorkoutDTO(from: decoder)
    }
}

// MARK: - Requests

struct NewWorkout: Encodable, Equatable {
    /// If a workout with this UUID already exists, it is returned instead of creating it again.
    var clientUuid: UUID?
    /// 1 to 25 characters.
    var name: String
    var date: Date
    /// In minutes, at most 1440.
    var duration: Int
    /// Several workouts can be in progress, the app avoids it.
    var inProgress: Bool
    /// Their indexes must be exactly 0..<count.
    var exercises: [WorkoutExerciseDraft]
}

/// A workout exercise with its sets. The metrics the exercise doesn't track are nil and left out of the request.
struct WorkoutExerciseDraft: Codable, Equatable {
    /// Only used when creating. If the workout already contains an exercise with this UUID, it is returned instead of creating it again.
    var clientUuid: UUID? = nil
    var exerciseId: Int
    var unilateral: Bool = false
    var index: Int

    var reps: [Int]? = nil
    var weights: [Double]? = nil
    var time: [Int]? = nil
    var intensity: [Double]? = nil
    var distance: [Double]? = nil
}

/// Only the fields that are set are changed.
struct WorkoutUpdate: Codable, Equatable {
    var name: String?
    var date: Date?
    var duration: Int?
    /// False finishes the workout, true continues it.
    var inProgress: Bool?
}

/// Only the fields that are set are changed. When the exercise changes, the sets have to fit the new exercise.
struct WorkoutExerciseUpdate: Codable, Equatable {
    var exerciseId: Int?
    var unilateral: Bool?
    /// The other exercises of the workout are shifted accordingly.
    var index: Int?

    var reps: [Int]?
    var weights: [Double]?
    var time: [Int]?
    var intensity: [Double]?
    var distance: [Double]?
}

/// The body of PATCH /workouts/{id}: the fields of `workout` that are set, plus the changes of its exercises. The
/// server applies the workout fields first and then the exercise changes in order, all in one transaction: if one
/// of them fails, nothing is changed.
struct WorkoutBatchUpdate: Codable, Equatable {
    /// Nil leaves the workout itself as it is.
    var workout: WorkoutUpdate?
    var exerciseChanges: [WorkoutExerciseChange] = []

    private enum CodingKeys: String, CodingKey {
        case exerciseChanges
    }

    init(workout: WorkoutUpdate?, exerciseChanges: [WorkoutExerciseChange] = []) {
        self.workout = workout
        self.exerciseChanges = exerciseChanges
    }

    init(from decoder: Decoder) throws {
        let update = try WorkoutUpdate(from: decoder)
        workout = update == WorkoutUpdate() ? nil : update
        let container = try decoder.container(keyedBy: CodingKeys.self)
        exerciseChanges = try container.decodeIfPresent([WorkoutExerciseChange].self, forKey: .exerciseChanges) ?? []
    }

    func encode(to encoder: Encoder) throws {
        try workout?.encode(to: encoder)
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(exerciseChanges, forKey: .exerciseChanges)
    }
}

/// One change of `WorkoutBatchUpdate.exerciseChanges`, a union discriminated by "op". A create inserts the exercise
/// at its index, the exercises at or after it move back by one. An update changes the workout exercise with that
/// server id, the other exercises are shifted when its index changes.
enum WorkoutExerciseChange: Codable, Equatable {
    case create(WorkoutExerciseDraft)
    case update(id: Int, WorkoutExerciseUpdate)

    private enum Op: String, Codable {
        case create, update
    }

    private enum CodingKeys: String, CodingKey {
        case op, id
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        switch try container.decode(Op.self, forKey: .op) {
        case .create:
            self = .create(try WorkoutExerciseDraft(from: decoder))
        case .update:
            self = .update(id: try container.decode(Int.self, forKey: .id), try WorkoutExerciseUpdate(from: decoder))
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .create(let draft):
            try container.encode(Op.create, forKey: .op)
            try draft.encode(to: encoder)
        case .update(let id, let update):
            try container.encode(Op.update, forKey: .op)
            try container.encode(id, forKey: .id)
            try update.encode(to: encoder)
        }
    }
}
