//
//  StatsCalculator.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 12.09.2024.
//

import Foundation

/// Sums, averages and records over the sets of workouts, in the units they are stored in (kg, m, s).
///
/// Every metric is only tracked by some exercises: an exercise that doesn't track it has nil instead of an array
/// and is left out. Averages are per entry, so the right and the left side of a unilateral set count separately,
/// and only over the entries in which the value was entered (not 0).
struct StatsSummary: Sendable {

    var workouts = 0
    /// In minutes, only for summaries of whole workouts
    var duration = 0
    /// A right and a left entry of a unilateral exercise are one set
    var sets = 0

    var reps = Metric()
    /// Sum of reps x weight, only of exercises that track both
    var volume = 0.0
    var weights = Metric()
    /// The heaviest weight, with the most reps done with it (0 if the exercise doesn't track reps)
    var personalRecord: (weight: Double, reps: Int)?
    /// In seconds
    var time = Metric()
    var intensity = Metric()
    /// In meters
    var distance = Metric()

    struct Metric: Sendable {
        /// Whether any of the exercises tracks it
        var isTracked = false
        var total = 0.0
        /// Entries with a value other than 0
        var count = 0
        var max = 0.0

        var average: Double? {
            count > 0 ? total / Double(count) : nil
        }

        fileprivate mutating func add<Value: BinaryInteger>(_ values: [Value]?) {
            add(values?.map(Double.init))
        }

        fileprivate mutating func add(_ values: [Double]?) {
            guard let values else { return }
            isTracked = true
            for value in values where value != 0 {
                total += value
                count += 1
                max = Swift.max(max, value)
            }
        }
    }
}

enum StatsCalculator {

    /// Over the finished workouts, including their duration
    static func summary(of workouts: [Workout]) -> StatsSummary {
        var summary = summary(of: workouts.flatMap(\.workoutExercises))
        summary.workouts = workouts.count
        summary.duration = workouts.reduce(0) { $0 + $1.duration }
        return summary
    }

    /// Over single exercises of workouts, e.g. all the times one exercise was done. `workouts` counts the workouts
    /// they are part of, `duration` stays 0.
    static func summary(of workoutExercises: [WorkoutExercise]) -> StatsSummary {
        var summary = StatsSummary()
        summary.workouts = Set(workoutExercises.compactMap { $0.workout?.persistentModelID }).count

        for workoutExercise in workoutExercises {
            summary.sets += workoutExercise.getNumberOfSets()
            summary.reps.add(workoutExercise.reps)
            summary.weights.add(workoutExercise.weights)
            summary.time.add(workoutExercise.time)
            summary.intensity.add(workoutExercise.intensity)
            summary.distance.add(workoutExercise.distance)
            summary.volume += workoutExercise.volume

            if let weights = workoutExercise.weights {
                for (index, weight) in weights.enumerated() where weight > 0 {
                    let reps = workoutExercise.reps?[index] ?? 0
                    if let record = summary.personalRecord, weight < record.weight || (weight == record.weight && reps <= record.reps) {
                        continue
                    }
                    summary.personalRecord = (weight, reps)
                }
            }
        }
        return summary
    }
}

// MARK: - Formatting

extension StatsSummary {

    /// e.g. "1 h 5 min"
    static func formatDuration(minutes: Int) -> String {
        if minutes < 60 {
            return "\(minutes) min"
        }
        return "\(minutes / 60) h \(minutes % 60) min"
    }

    /// e.g. "45 s", "2 min 5 s" or "1 h 2 min"
    static func formatTime(seconds: Double) -> String {
        let seconds = Int(seconds.rounded())
        if seconds < 60 {
            return "\(seconds) s"
        } else if seconds < 3600 {
            return seconds % 60 == 0 ? "\(seconds / 60) min" : "\(seconds / 60) min \(seconds % 60) s"
        }
        return formatDuration(minutes: seconds / 60)
    }

    /// The time of a single set, e.g. "0:45", "1:30" or "1:00:00"
    static func formatSetTime(seconds: Int) -> String {
        if seconds >= 3600 {
            return String(format: "%d:%02d:%02d", seconds / 3600, seconds / 60 % 60, seconds % 60)
        }
        return String(format: "%d:%02d", seconds / 60, seconds % 60)
    }

    /// e.g. "lvl 5.5"
    static func formatIntensity(_ intensity: Double) -> String {
        "lvl " + UnitSystem.number(intensity, maxDecimals: 1)
    }

    /// e.g. "10x 100.0 kg", or only the weight if the exercise doesn't track reps
    static func formatRecord(_ record: (weight: Double, reps: Int), unit: UnitSystem) -> String {
        let weight = unit.formatWeight(kilograms: record.weight)
        return record.reps > 0 ? "\(record.reps)x \(weight)" : weight
    }
}
