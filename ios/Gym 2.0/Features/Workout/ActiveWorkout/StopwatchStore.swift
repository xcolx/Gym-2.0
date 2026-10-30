//
//  StopwatchStore.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 14.10.2026.
//

import Foundation
import SwiftData

// The stopwatches of the time fields in the performing workout, one per set.
// They live as long as the workout is open, so they keep running while the keyboard is closed.
@Observable
final class StopwatchStore {

    struct Key: Hashable {
        let workoutExercise: PersistentIdentifier
        let set: Int
    }

    struct Stopwatch {
        // the time measured before the last start
        var accumulated: TimeInterval = 0
        // nil while paused
        var startedAt: Date? = nil

        var isRunning: Bool {
            startedAt != nil
        }

        func elapsed(at date: Date) -> TimeInterval {
            accumulated + (startedAt.map { date.timeIntervalSince($0) } ?? 0)
        }
    }

    private var stopwatches: [Key: Stopwatch] = [:]

    // Without a stopwatch for the set it starts paused at the time the field shows
    func stopwatch(for key: Key, fieldSeconds: Double) -> Stopwatch {
        stopwatches[key] ?? Stopwatch(accumulated: fieldSeconds)
    }

    func start(_ key: Key, fieldSeconds: Double) {
        var stopwatch = stopwatch(for: key, fieldSeconds: fieldSeconds)
        guard !stopwatch.isRunning else { return }
        stopwatch.startedAt = .now
        stopwatches[key] = stopwatch
    }

    func pause(_ key: Key, fieldSeconds: Double) {
        var stopwatch = stopwatch(for: key, fieldSeconds: fieldSeconds)
        stopwatch.accumulated = stopwatch.elapsed(at: .now)
        stopwatch.startedAt = nil
        stopwatches[key] = stopwatch
    }

    // Removes the stopwatch and returns the measured time
    func stop(_ key: Key, fieldSeconds: Double) -> TimeInterval {
        let elapsed = stopwatch(for: key, fieldSeconds: fieldSeconds).elapsed(at: .now)
        stopwatches[key] = nil
        return elapsed
    }
}
