//
//  Exercise+Helpers.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 05.10.2026.
//

import Foundation
import SwiftData

extension Exercise {

    // Names of the equipment for which the bodyweight is the default weight of a set
    static let bodyweightEquipmentNames: Set<String> = ["Body", "Pull Up Bar"]

    // At most this many images, e.g. one per keyframe of the movement (MAX_EXERCISE_IMAGES of the server)
    static let maxImages = 10

    // The reference data is stored by server id, these look the models up in the context of the exercise

    var muscleGroup: MuscleGroup? {
        let id = muscleGroupId
        return try? modelContext?.fetch(FetchDescriptor<MuscleGroup>(predicate: #Predicate { $0.serverId == id })).first
    }

    var equipment: Equipment? {
        let id = equipmentId
        return try? modelContext?.fetch(FetchDescriptor<Equipment>(predicate: #Predicate { $0.serverId == id })).first
    }

    var primaryMuscles: [Muscle] {
        muscles(ids: primaryMuscleIds)
    }

    var secondaryMuscles: [Muscle] {
        muscles(ids: secondaryMuscleIds)
    }

    // The shown name first, then the aliases, which are only used by the search
    var searchNames: [String] {
        [name] + aliases
    }

    var usesBodyweight: Bool {
        Self.bodyweightEquipmentNames.contains(equipment?.name ?? "")
    }

    // The metrics tracked per set, in the order they are shown
    var trackedMetrics: [SetMetric] {
        SetMetric.allCases.filter(tracks)
    }

    func tracks(_ metric: SetMetric) -> Bool {
        switch metric {
        case .reps: tracksReps
        case .weights: tracksWeights
        case .time: tracksTime
        case .intensity: tracksIntensity
        case .distance: tracksDistance
        }
    }

    // Verified exercises can't be changed. The set data of performed workouts depends on the tracked metrics,
    // so those can't be changed once the exercise is part of a workout.
    var canEdit: Bool {
        !verified
    }

    var canChangeTrackedMetrics: Bool {
        !verified && workoutExercises.isEmpty
    }

    private func muscles(ids: [Int]) -> [Muscle] {
        guard let muscles = try? modelContext?.fetch(FetchDescriptor<Muscle>(predicate: #Predicate { ids.contains($0.serverId) })) else {
            return []
        }
        // in the order of the ids
        return ids.compactMap { id in muscles.first { $0.serverId == id } }
    }
}
