//
//  WorkoutLastChange.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 16.10.2026.
//

import Foundation

/// The time of the last change of a workout in progress on this device, by client UUID. When the workout is ended long
/// after it, the user is asked whether it ended then instead of now (`Workout.suggestedEnd`), e.g. after forgetting to
/// end it. Only stored in the UserDefaults, never synced: on another device the workout has no last change and ends now.
enum WorkoutLastChange {
    private static let key = "workoutLastChange"

    /// Ending the workout more than this after the last change asks whether it ended then
    static let questionAfter: TimeInterval = 5 * 60

    private static var all: [UUID: Date] {
        guard let data = UserDefaults.standard.data(forKey: key) else { return [:] }
        return (try? JSONDecoder().decode([UUID: Date].self, from: data)) ?? [:]
    }

    static func record(_ clientUUID: UUID, at date: Date = .now) {
        var lastChanges = all
        lastChanges[clientUUID] = date
        save(lastChanges)
    }

    static func lastChange(of clientUUID: UUID) -> Date? {
        all[clientUUID]
    }

    /// When the workout is ended, cancelled or continued
    static func remove(_ clientUUID: UUID) {
        var lastChanges = all
        guard lastChanges.removeValue(forKey: clientUUID) != nil else { return }
        save(lastChanges)
    }

    static func removeAll() {
        UserDefaults.standard.removeObject(forKey: key)
    }

    private static func save(_ lastChanges: [UUID: Date]) {
        UserDefaults.standard.set(try? JSONEncoder().encode(lastChanges), forKey: key)
    }
}

extension Workout {

    /// Called by the changes of the user, records the last change while the workout is in progress (past workouts have none)
    func noteChange() {
        if inProgress {
            WorkoutLastChange.record(clientUUID)
        }
    }

    /// The end to suggest instead of now: the last change on this device, if it was after the start and more than
    /// `WorkoutLastChange.questionAfter` ago. Nil without a last change, e.g. on another device.
    func suggestedEnd(now: Date = .now) -> Date? {
        guard let lastChange = WorkoutLastChange.lastChange(of: clientUUID), lastChange > date else { return nil }
        return now.timeIntervalSince(lastChange) > WorkoutLastChange.questionAfter ? lastChange : nil
    }
}
