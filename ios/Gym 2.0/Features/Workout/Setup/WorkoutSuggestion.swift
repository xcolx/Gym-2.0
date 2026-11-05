//
//  WorkoutSuggestion.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 04.11.2026.
//

import Foundation

/// Picks the exercises of a suggested workout: ones that are possible with the available equipment, preferring the
/// ones for muscles that weren't trained this week yet, as many as fit into the time
enum WorkoutSuggestion {

    struct Settings: Hashable {
        /// Server ids of the selected equipment, bodyweight exercises are always possible
        var equipmentIds: Set<Int>
        var minutes: Double
    }

    /// Bodyweight exercises are always possible
    static func isAlwaysAvailable(_ pieceOfEquipment: Equipment) -> Bool {
        pieceOfEquipment.name == "Body"
    }

    static func exerciseCount(minutes: Double) -> Int {
        switch minutes {
        case 15: 2
        case 30: 3
        case 45: 4
        case 60: 5
        default: Int(minutes / 15)
        }
    }

    /// Shuffled, so that every call can give other exercises
    static func exercises(for settings: Settings, exercises: [Exercise], equipment: [Equipment], workoutsThisWeek: [Workout]) -> [Exercise] {
        let availableEquipmentIds = Set(equipment.filter { isAlwaysAvailable($0) || settings.equipmentIds.contains($0.serverId) }.map(\.serverId))
        var possibleExercises = exercises.filter { availableEquipmentIds.contains($0.equipmentId) }
        let numberOfExercises = exerciseCount(minutes: settings.minutes)

        // the exercises for muscles that weren't trained this week yet
        let trainedMuscleIds = Set(workoutsThisWeek.musclesTrained().0.map(\.serverId))
        var exerciseList = possibleExercises.filter { $0.primaryMuscleIds.allSatisfy { !trainedMuscleIds.contains($0) } }

        exerciseList.shuffle()
        if exerciseList.count < numberOfExercises {
            // filled up with the other possible exercises
            possibleExercises.shuffle()
            for exercise in possibleExercises where !exerciseList.contains(exercise) {
                exerciseList.append(exercise)
            }
        }
        return Array(exerciseList.prefix(numberOfExercises))
    }
}
