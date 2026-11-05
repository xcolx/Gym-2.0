//
//  StatsOverviewTests.swift
//  Gym 2.0Tests
//
//  Created by Colin Rüegg on 03.11.2026.
//
//  The activity, muscles and exercises of the stats overview
//

import Foundation
import Testing
@testable import Gym_2_0

@MainActor
struct StatsOverviewTests {

    @Test func sumsTheMinutesOfTheWorkoutsOfADay() throws {
        let store = try TestStore()
        let calendar = testCalendar()
        let workouts = [
            store.workout(date: date(2026, 11, 3, 8), duration: 45),
            store.workout(date: date(2026, 11, 3, 18), duration: 30),
            store.workout(date: date(2026, 11, 1, 10), duration: 60),
        ]

        let overview = StatsOverview.make(workouts: workouts, equipment: [], muscleGroups: [], user: nil, calendar: calendar)

        #expect(overview.minutesByDay == [date(2026, 11, 3): 75, date(2026, 11, 1): 60])
    }

    @Test func countsTheSetsPerMuscleWithAThirdForSecondaryMuscles() throws {
        let store = try TestStore()
        let bench = store.exercise("Bench Press", primaryMuscleIds: [1], secondaryMuscleIds: [2])
        let dips = store.exercise("Dips", primaryMuscleIds: [2])
        let workouts = [
            store.workout(exercises: [(bench, Sets(reps: [10, 8, 6], weights: [50, 60, 70])), (dips, Sets(reps: [10, 10], weights: [0, 0]))]),
            store.workout(exercises: [(bench, Sets(reps: [5, 5, 5, 5], weights: [60, 60, 60, 60], unilateral: true))]),
        ]

        let overview = StatsOverview.make(workouts: workouts, equipment: [], muscleGroups: [], user: nil)

        // 3 + 2 sets of bench press, the four unilateral entries are two sets
        #expect(overview.setsByMuscleId[1] == 5)
        #expect(abs((overview.setsByMuscleId[2] ?? 0) - (2 + 0.33 * 5)) < 0.0001)
        #expect(overview.exerciseCount == 2)
    }

    @Test func hasNoActivityOrMusclesWithoutWorkouts() {
        let overview = StatsOverview.make(workouts: [], equipment: [], muscleGroups: [], user: nil)

        #expect(overview.minutesByDay.isEmpty)
        #expect(overview.setsByMuscleId.isEmpty)
        #expect(overview.exerciseCount == 0)
    }
}
