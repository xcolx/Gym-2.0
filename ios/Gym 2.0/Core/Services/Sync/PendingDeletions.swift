//
//  PendingDeletions.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 12.10.2026.
//

import Foundation
import SwiftData

/// Server ids of objects that were deleted locally and still have to be deleted on the server.
///
/// The models are deleted from SwiftData right away, so the UI doesn't have to filter them out,
/// and only their server ids are kept here until the server confirmed the deletion.
struct PendingDeletion: Codable, Hashable {
    enum Kind: String, Codable {
        case exercise, workout, workoutExercise, workoutScheme

        /// For messages to the user
        var displayName: String {
            switch self {
            case .exercise: "exercise"
            case .workout: "workout"
            case .workoutExercise: "exercise of a workout"
            case .workoutScheme: "workout scheme"
            }
        }
    }

    let kind: Kind
    let serverId: Int
}

enum PendingDeletions {
    private static let key = "pendingDeletions"

    static var all: [PendingDeletion] {
        guard let data = UserDefaults.standard.data(forKey: key) else { return [] }
        return (try? JSONDecoder().decode([PendingDeletion].self, from: data)) ?? []
    }

    static func add(_ kind: PendingDeletion.Kind, serverId: Int?) {
        guard let serverId else { return }
        var deletions = all
        let deletion = PendingDeletion(kind: kind, serverId: serverId)
        guard !deletions.contains(deletion) else { return }
        deletions.append(deletion)
        save(deletions)
    }

    static func remove(_ deletion: PendingDeletion) {
        save(all.filter { $0 != deletion })
    }

    static func removeAll() {
        UserDefaults.standard.removeObject(forKey: key)
    }

    private static func save(_ deletions: [PendingDeletion]) {
        UserDefaults.standard.set(try? JSONEncoder().encode(deletions), forKey: key)
    }
}

// Use these instead of `delete(_:)` for synced models, so that the deletion reaches the server.
// Objects that were never pushed (no server id) are only deleted locally.
extension ModelContext {

    func deleteSynced(_ exercise: Exercise) {
        PendingDeletions.add(.exercise, serverId: exercise.serverId)
        delete(exercise)
    }

    /// Its exercises are deleted together with it, also on the server.
    func deleteSynced(_ workout: Workout) {
        PendingDeletions.add(.workout, serverId: workout.serverId)
        delete(workout)
    }

    func deleteSynced(_ workoutExercise: WorkoutExercise) {
        PendingDeletions.add(.workoutExercise, serverId: workoutExercise.serverId)
        delete(workoutExercise)
    }

    func deleteSynced(_ scheme: WorkoutScheme) {
        PendingDeletions.add(.workoutScheme, serverId: scheme.serverId)
        delete(scheme)
    }
}
