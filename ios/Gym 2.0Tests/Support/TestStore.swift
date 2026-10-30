//
//  TestStore.swift
//  Gym 2.0Tests
//
//  Created by Colin Rüegg on 21.10.2026.
//
//  An in-memory SwiftData store with the current schema and helpers to fill it, like web/src/test/fixtures.ts.
//

import Foundation
import SwiftData
@testable import Gym_2_0

/// The set arrays of a workout exercise, nil for the metrics that aren't tracked
struct Sets {
    var reps: [Int]? = nil
    var weights: [Double]? = nil
    var time: [Int]? = nil
    var intensity: [Double]? = nil
    var distance: [Double]? = nil
    var unilateral = false
}

@MainActor
final class TestStore {
    let container: ModelContainer
    var context: ModelContext { container.mainContext }

    init() throws {
        let schema = Schema(versionedSchema: CurrentVersionOfSchema.self)
        // Named, so that every store is a store of its own
        let configuration = ModelConfiguration(UUID().uuidString, schema: schema, isStoredInMemoryOnly: true)
        container = try ModelContainer(for: schema, migrationPlan: MyMigrationPlan.self, configurations: configuration)
    }

    /// The reference data of web/src/test/fixtures.ts
    func insertReferenceData() {
        for (id, name) in [(1, "Chest"), (2, "Triceps"), (3, "Front Deltoid"), (4, "Quads")] {
            context.insert(Muscle(serverId: id, name: name, imageUrl: ""))
        }
        for (id, name) in [(1, "Chest"), (2, "Legs")] {
            context.insert(MuscleGroup(serverId: id, name: name))
        }
        for (id, name) in [(1, "Barbell"), (2, "Body"), (3, "Pull Up Bar")] {
            context.insert(Equipment(serverId: id, name: name))
        }
    }

    var equipment: [Equipment] { (try? context.fetchAll(Equipment.self)) ?? [] }
    var muscleGroups: [MuscleGroup] { (try? context.fetchAll(MuscleGroup.self)) ?? [] }

    @discardableResult
    func exercise(
        _ name: String = "Exercise",
        serverId: Int? = nil,
        syncState: SyncState = .synced,
        aliases: [String] = [],
        verified: Bool = false,
        muscleGroupId: Int = 1,
        equipmentId: Int = 1,
        primaryMuscleIds: [Int] = [],
        secondaryMuscleIds: [Int] = [],
        tracksReps: Bool = true,
        tracksWeights: Bool = true,
        tracksTime: Bool = false,
        tracksIntensity: Bool = false,
        tracksDistance: Bool = false
    ) -> Exercise {
        let exercise = Exercise(
            name: name,
            aliases: aliases,
            muscleGroupId: muscleGroupId,
            equipmentId: equipmentId,
            primaryMuscleIds: primaryMuscleIds,
            secondaryMuscleIds: secondaryMuscleIds,
            verified: verified,
            tracksReps: tracksReps,
            tracksWeights: tracksWeights,
            tracksTime: tracksTime,
            tracksIntensity: tracksIntensity,
            tracksDistance: tracksDistance
        )
        exercise.serverId = serverId
        exercise.syncState = syncState
        context.insert(exercise)
        return exercise
    }

    /// A finished workout with the exercises in this order
    @discardableResult
    func workout(
        _ name: String = "Workout",
        date: Date = Date(timeIntervalSince1970: 1_790_000_000),
        duration: Int = 60,
        inProgress: Bool = false,
        serverId: Int? = nil,
        syncState: SyncState = .synced,
        exercises: [(Exercise, Sets)] = []
    ) -> Workout {
        let workout = Workout(name: name, date: date, duration: duration, inProgress: inProgress)
        workout.serverId = serverId
        workout.syncState = syncState
        context.insert(workout)
        workout.workoutExercises = exercises.enumerated().map { index, item in
            let (exercise, sets) = item
            let workoutExercise = WorkoutExercise(
                workout: workout,
                exercise: exercise,
                unilateral: sets.unilateral,
                index: index,
                reps: sets.reps,
                weights: sets.weights,
                time: sets.time,
                intensity: sets.intensity,
                distance: sets.distance
            )
            workoutExercise.syncState = syncState
            context.insert(workoutExercise)
            return workoutExercise
        }
        return workout
    }
}

/// A Gregorian calendar independent of the settings of the simulator, the week starting on Monday
func testCalendar() -> Calendar {
    var calendar = Calendar(identifier: .gregorian)
    calendar.locale = Locale(identifier: "en_US_POSIX")
    calendar.timeZone = TimeZone(identifier: "Europe/Zurich")!
    calendar.firstWeekday = 2
    return calendar
}

/// A local date of `testCalendar()`, months start at 1 (unlike the JavaScript dates of the web tests)
func date(_ year: Int, _ month: Int, _ day: Int, _ hour: Int = 0, _ minute: Int = 0, _ second: Int = 0) -> Date {
    testCalendar().date(from: DateComponents(year: year, month: month, day: day, hour: hour, minute: minute, second: second))!
}

/// A UTC date from an ISO 8601 string, e.g. "2026-10-15T08:30:00Z"
func isoDate(_ string: String) -> Date {
    ISO8601DateFormatter().date(from: string)!
}
