//
//  StatsOverview.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 03.11.2026.
//

import Foundation
import SwiftData

/// What the overview of the stats shows besides the totals: the activity per day, the most trained muscles, the number
/// of exercises and the interesting facts. Calculated in the background with the totals, see WorkoutTotals.
struct StatsOverview: Sendable {

    /// The minutes worked out per day, by the start of the day
    var minutesByDay: [Date: Int] = [:]
    /// The sets per muscle by its server id. A set counts fully for a primary muscle and a third for a secondary one,
    /// like in the distribution by muscle.
    var setsByMuscleId: [Int: Double] = [:]
    /// The different exercises done in the finished workouts
    var exerciseCount = 0
    var facts: [InterestingFact] = []

    /// The share of a set that a secondary muscle gets
    static let secondaryMuscleShare = 0.33

    /// - Parameters:
    ///   - workouts: the finished workouts
    ///   - equipment: all equipment, for the facts
    ///   - muscleGroups: all muscle groups, for the facts
    ///   - user: the current user, for the units and the account creation date of the facts
    static func make(workouts: [Workout], equipment: [Equipment], muscleGroups: [MuscleGroup], user: User?, now: Date = .now, calendar: Calendar = .current) -> StatsOverview {
        var overview = StatsOverview()
        var exerciseIds = Set<PersistentIdentifier>()

        for workout in workouts {
            overview.minutesByDay[calendar.startOfDay(for: workout.date), default: 0] += workout.duration
            for workoutExercise in workout.workoutExercises {
                guard let exercise = workoutExercise.exercise else { continue }
                exerciseIds.insert(exercise.persistentModelID)
                let sets = Double(workoutExercise.getNumberOfSets())
                for muscleId in exercise.primaryMuscleIds {
                    overview.setsByMuscleId[muscleId, default: 0] += sets
                }
                for muscleId in exercise.secondaryMuscleIds {
                    overview.setsByMuscleId[muscleId, default: 0] += secondaryMuscleShare * sets
                }
            }
        }
        overview.exerciseCount = exerciseIds.count

        overview.facts = InterestingFactsCalculator.facts(
            of: workouts,
            equipment: equipment,
            muscleGroups: muscleGroups,
            memberSince: user?.createdAt,
            weightUnit: user?.weightUnit.flatMap(UnitSystem.init(rawValue:)) ?? .metric,
            distanceUnit: user?.distanceUnit.flatMap(UnitSystem.init(rawValue:)) ?? .metric,
            now: now,
            calendar: calendar
        )
        return overview
    }
}
