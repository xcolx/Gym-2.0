//
//  WorkoutTotalsTests.swift
//  Gym 2.0Tests
//
//  Created by Colin Rüegg on 25.10.2026.
//

import Foundation
import Testing
@testable import Gym_2_0

@MainActor
struct WorkoutTotalsTests {

    @Test func summarizesTheSavedFinishedWorkouts() async throws {
        let store = try TestStore()
        let bench = store.exercise("Bench Press")
        store.workout(duration: 60, exercises: [(bench, Sets(reps: [10, 8], weights: [50, 60]))])
        store.workout(duration: 30, inProgress: true, exercises: [(bench, Sets(reps: [5], weights: [70]))])
        try store.context.save()

        let totals = WorkoutTotals(context: store.context)
        await totals.calculation?.value
        #expect(totals.summary?.workouts == 1)
        #expect(totals.summary?.duration == 60)
        #expect(totals.summary?.sets == 2)
    }

    @Test func calculatesAgainAfterASave() async throws {
        let store = try TestStore()
        let totals = WorkoutTotals(context: store.context)
        await totals.calculation?.value
        #expect(totals.summary?.workouts == 0)

        let bench = store.exercise("Bench Press")
        store.workout(duration: 45, exercises: [(bench, Sets(reps: [10], weights: [50]))])
        try store.context.save()
        // the observer starts the calculation in a task of its own
        await Task.yield()
        await totals.calculation?.value
        #expect(totals.summary?.workouts == 1)
        #expect(totals.summary?.duration == 45)
    }
}
