//
//  ExerciseStatsTests.swift
//  Gym 2.0Tests
//
//  Created by Colin Rüegg on 03.11.2026.
//
//  The values of the progress chart of an exercise
//

import Foundation
import Testing
@testable import Gym_2_0

@MainActor
struct ExerciseStatsTests {

    @Test func chartsTheMetricsTheExerciseTracks() throws {
        let store = try TestStore()
        let bench = store.exercise("Bench Press")
        let run = store.exercise("Run", tracksReps: false, tracksWeights: false, tracksTime: true, tracksDistance: true)

        #expect(ExerciseChartMetric.metrics(for: bench) == [.heaviest, .volume, .reps])
        #expect(ExerciseChartMetric.metrics(for: run) == [.time, .distance])

        let sets = store.workout(exercises: [(bench, Sets(reps: [10, 5], weights: [50, 60]))]).workoutExercises[0]
        #expect(ExerciseChartMetric.heaviest.value(of: sets, weightUnit: .metric, distanceUnit: .metric) == 60)
        #expect(ExerciseChartMetric.volume.value(of: sets, weightUnit: .metric, distanceUnit: .metric) == 800)
        #expect(ExerciseChartMetric.reps.value(of: sets, weightUnit: .metric, distanceUnit: .metric) == 15)
        #expect(ExerciseChartMetric.time.value(of: sets, weightUnit: .metric, distanceUnit: .metric) == nil)
    }
}
