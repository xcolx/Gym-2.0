//
//  StatsCalculatorTests.swift
//  Gym 2.0Tests
//
//  Created by Colin Rüegg on 21.10.2026.
//
//  Mirrors web/src/lib/domain/stats.test.ts
//

import Foundation
import Testing
@testable import Gym_2_0

@MainActor
struct StatsCalculatorTests {

    let store: TestStore
    let workouts: [Workout]

    init() throws {
        store = try TestStore()
        let bench = store.exercise("Bench Press")
        let run = store.exercise("Run", tracksReps: false, tracksWeights: false, tracksTime: true, tracksDistance: true)
        workouts = [
            store.workout(duration: 60, exercises: [
                (bench, Sets(reps: [10, 8, 0], weights: [50, 60, 70])),
                (run, Sets(time: [600], distance: [2000])),
            ]),
            store.workout(duration: 45, exercises: [
                (bench, Sets(reps: [5, 5, 3, 3], weights: [60, 60, 70, 70], unilateral: true)),
            ]),
        ]
    }

    @Test func sumsTheWorkoutsDurationsSetsAndMetrics() {
        let summary = StatsCalculator.summary(of: workouts)
        #expect(summary.workouts == 2)
        #expect(summary.duration == 105)
        // 3 + 1 + 2 (four unilateral entries are two sets)
        #expect(summary.sets == 6)
        #expect(summary.reps.total == 34)
        #expect(summary.volume == Double(10 * 50 + 8 * 60 + 5 * 60 + 5 * 60 + 3 * 70 + 3 * 70))
        #expect(summary.distance.isTracked)
        #expect(summary.distance.total == 2000)
        #expect(summary.distance.count == 1)
        #expect(summary.distance.max == 2000)
        #expect(summary.time.total == 600)
        #expect(summary.weights.max == 70)
        #expect(!summary.intensity.isTracked)
    }

    @Test func averagesOnlyTheEntriesWithAValue() throws {
        let summary = StatsCalculator.summary(of: workouts)
        // the 0 reps entry is left out
        #expect(summary.reps.count == 6)
        let average = try #require(summary.reps.average)
        #expect(abs(average - 34.0 / 6) < 1e-9)
        #expect(summary.intensity.average == nil)
    }

    @Test func findsTheHeaviestWeightWithTheMostRepsAsPersonalRecord() throws {
        let record = try #require(StatsCalculator.summary(of: workouts).personalRecord)
        #expect(record.weight == 70)
        #expect(record.reps == 3)
    }

    @Test func countsTheWorkoutsOfSingleWorkoutExercises() {
        let exercise = store.exercise()
        let a = store.workout(exercises: [(exercise, Sets(reps: [1], weights: [10])), (exercise, Sets(reps: [2], weights: [20]))])
        let b = store.workout(exercises: [(exercise, Sets(reps: [3], weights: [30]))])
        let summary = StatsCalculator.summary(of: a.workoutExercises + b.workoutExercises)
        #expect(summary.workouts == 2)
        #expect(summary.duration == 0)
        #expect(summary.sets == 3)
    }

    @Test func isEmptyWithoutWorkouts() {
        let summary = StatsCalculator.summary(of: [Workout]())
        #expect(summary.workouts == 0)
        #expect(summary.sets == 0)
        #expect(summary.personalRecord == nil)
        #expect(summary.reps.average == nil)
    }

    // MARK: Formatting

    @Test func formatsDurationsAndTimes() {
        #expect(StatsSummary.formatDuration(minutes: 45) == "45 min")
        #expect(StatsSummary.formatDuration(minutes: 65) == "1 h 5 min")
        #expect(StatsSummary.formatTime(seconds: 45) == "45 s")
        #expect(StatsSummary.formatTime(seconds: 120) == "2 min")
        #expect(StatsSummary.formatTime(seconds: 125) == "2 min 5 s")
        #expect(StatsSummary.formatTime(seconds: 3720) == "1 h 2 min")
    }

    @Test func formatsTheTimeOfASet() {
        #expect(StatsSummary.formatSetTime(seconds: 45) == "0:45")
        #expect(StatsSummary.formatSetTime(seconds: 90) == "1:30")
        #expect(StatsSummary.formatSetTime(seconds: 3600) == "1:00:00")
    }

    @Test func formatsIntensitiesAndRecords() {
        #expect(StatsSummary.formatIntensity(5.5) == "lvl 5.5")
        #expect(StatsSummary.formatIntensity(5) == "lvl 5")
        #expect(StatsSummary.formatRecord((weight: 100, reps: 10), unit: .metric) == "10x 100.0 kg")
        #expect(StatsSummary.formatRecord((weight: 100, reps: 0), unit: .metric) == "100.0 kg")
    }
}
