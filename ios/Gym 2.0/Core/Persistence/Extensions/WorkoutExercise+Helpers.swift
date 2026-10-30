//
//  WorkoutExercise+Helpers.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 24.02.2025.
//

import Foundation

// The values that can be tracked per set, weights in kilograms, time in seconds and distance in meters
enum SetMetric: CaseIterable, Hashable {
    case reps, weights, time, intensity, distance

    var name: String {
        switch self {
        case .reps: "Reps"
        case .weights: "Weight"
        case .time: "Time"
        case .intensity: "Intensity"
        case .distance: "Distance"
        }
    }

    // The limits of the server in the stored units, reps are limited lower than on the server
    var range: ClosedRange<Double> {
        switch self {
        case .reps: 0...999
        case .weights: 0...9999.9
        case .time: 0...86400
        case .intensity: -9999.99...9999.99
        case .distance: 0...999999.999
        }
    }

    // The values the server accepts, a workout with other values is refused. Negative weights can't be entered in the
    // app, but may come from the import of the legacy data.
    var serverRange: ClosedRange<Double> {
        switch self {
        case .reps: 0...9999
        case .weights: -9999.9...9999.9
        default: range
        }
    }
}

extension WorkoutExercise {

    // Number of entries in the set arrays, unilateral exercises have two entries (right and left) per set
    var entryCount: Int {
        let counts: [Int?] = [reps?.count, weights?.count, time?.count, intensity?.count, distance?.count]
        return counts.compactMap { $0 }.first ?? 0
    }

    func getNumberOfSets() -> Int{

        if self.unilateral {
            return entryCount / 2
        } else {
            return entryCount
        }
    }

    var totalReps: Int {
        reps?.reduce(0, +) ?? 0
    }

    // Sum of reps x weight, 0 if the exercise does not track both
    var volume: Double {
        guard let reps, let weights else { return 0 }
        return zip(reps, weights).reduce(0) { $0 + Double($1.0) * $1.1 }
    }

    // Starts the set arrays of a new workout exercise with one empty set for every metric the exercise tracks
    func startSets(bodyWeight: Double) {
        guard let exercise else { return }
        reps = exercise.tracksReps ? [] : nil
        weights = exercise.tracksWeights ? [] : nil
        time = exercise.tracksTime ? [] : nil
        intensity = exercise.tracksIntensity ? [] : nil
        distance = exercise.tracksDistance ? [] : nil
        appendEntry(bodyWeight: bodyWeight)
        if unilateral {
            appendEntry(bodyWeight: bodyWeight)
        }
    }

    // Marks the synced exercise as changed, so that its sets are pushed with the next sync. The functions that change
    // the sets call it, also while the workout is in progress, since it's synced then too.
    func markChanged() {
        if syncState == .synced {
            syncState = .updated
        }
    }

    // Adds one entry to every tracked metric, the weight starts with the bodyweight for bodyweight exercises
    func appendEntry(bodyWeight: Double) {
        reps?.append(0)
        weights?.append(exercise?.usesBodyweight == true ? bodyWeight : 0)
        time?.append(0)
        intensity?.append(0)
        distance?.append(0)
        markChanged()
    }

    func removeEntry(at index: Int) {
        reps?.remove(at: index)
        weights?.remove(at: index)
        time?.remove(at: index)
        intensity?.remove(at: index)
        distance?.remove(at: index)
        markChanged()
        workout?.noteChange()
    }

    // Converts the entries together with the switch, a sync that sets unilateral from the server must not convert them
    // again: they were converted on the device that switched it
    func setUnilateral(_ unilateral: Bool) {
        guard unilateral != self.unilateral else { return }
        convertEntries(toUnilateral: unilateral)
        self.unilateral = unilateral
        workout?.noteChange()
    }

    // Doubles every entry (right and left) when switching to unilateral, keeps only the right side when switching back
    private func convertEntries(toUnilateral unilateral: Bool) {
        func convert<T: Numeric>(_ values: [T]?) -> [T]? {
            guard let values else { return nil }
            if unilateral {
                return values.flatMap { [$0, 0] }
            }
            return values.enumerated().filter { $0.offset % 2 == 0 }.map(\.element)
        }
        reps = convert(reps)
        weights = convert(weights)
        time = convert(time)
        intensity = convert(intensity)
        distance = convert(distance)
        markChanged()
    }

    // An entry is empty if no value was entered, the values not entered are 0. The weight of a bodyweight exercise
    // starts with the bodyweight (in kilograms), so it counts as not entered as long as it wasn't changed.
    func isEntryEmpty(at index: Int, bodyWeight: Double) -> Bool {
        trackedMetrics.allSatisfy { metric in
            let value = value(of: metric, at: index) ?? 0
            if metric == .weights && exercise?.usesBodyweight == true && value == bodyWeight {
                return true
            }
            return value == 0
        }
    }

    // The metrics with a set array, in the order they are shown
    var trackedMetrics: [SetMetric] {
        SetMetric.allCases.filter(tracks)
    }

    func tracks(_ metric: SetMetric) -> Bool {
        switch metric {
        case .reps: reps != nil
        case .weights: weights != nil
        case .time: time != nil
        case .intensity: intensity != nil
        case .distance: distance != nil
        }
    }

    // Reps and time are stored as Int, they are converted from and to Double so that all metrics can be edited the same way
    func value(of metric: SetMetric, at index: Int) -> Double? {
        switch metric {
        case .reps: reps.map { Double($0[index]) }
        case .weights: weights?[index]
        case .time: time.map { Double($0[index]) }
        case .intensity: intensity?[index]
        case .distance: distance?[index]
        }
    }

    // Does nothing if the metric is not tracked
    func setValue(_ value: Double, of metric: SetMetric, at index: Int) {
        switch metric {
        case .reps: reps?[index] = Int(value.rounded())
        case .weights: weights?[index] = value
        case .time: time?[index] = Int(value.rounded())
        case .intensity: intensity?[index] = value
        case .distance: distance?[index] = value
        }
        markChanged()
        workout?.noteChange()
    }

    // e.g. "R 10x, 50.0 kg" for the entry at the index, in the units the user picked
    func entryDescription(at index: Int, weightUnit: UnitSystem, distanceUnit: UnitSystem) -> String {
        var parts: [String] = []
        if let reps { parts.append("\(reps[index])x") }
        if let weights { parts.append(weightUnit.formatWeight(kilograms: weights[index])) }
        if let time { parts.append(StatsSummary.formatSetTime(seconds: time[index])) }
        if let intensity { parts.append(StatsSummary.formatIntensity(intensity[index])) }
        if let distance { parts.append(distanceUnit.formatDistance(meters: distance[index])) }

        let description = parts.joined(separator: ", ")
        if unilateral {
            return (index % 2 == 0 ? "R " : "L ") + description
        }
        return description
    }
}
