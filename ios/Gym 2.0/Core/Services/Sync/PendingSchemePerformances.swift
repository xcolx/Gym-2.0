//
//  PendingSchemePerformances.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 14.10.2026.
//

import Foundation

/// The workout schemes a workout was started from, until the server has set their last performed date.
/// Stored by client UUID, since a scheme created offline has no server id yet.
enum PendingSchemePerformances {
    private static let key = "pendingSchemePerformances"

    static var all: [UUID] {
        guard let data = UserDefaults.standard.data(forKey: key) else { return [] }
        return (try? JSONDecoder().decode([UUID].self, from: data)) ?? []
    }

    static func add(_ clientUUID: UUID) {
        var performances = all
        guard !performances.contains(clientUUID) else { return }
        performances.append(clientUUID)
        save(performances)
    }

    static func remove(_ clientUUID: UUID) {
        save(all.filter { $0 != clientUUID })
    }

    static func removeAll() {
        UserDefaults.standard.removeObject(forKey: key)
    }

    private static func save(_ performances: [UUID]) {
        UserDefaults.standard.set(try? JSONEncoder().encode(performances), forKey: key)
    }
}

extension WorkoutScheme {

    /// Called when a workout of the scheme is started. The next sync sets the last performed date on the server,
    /// which uses the time of that request, so a scheme started offline gets the time it was synced.
    func markPerformed() {
        lastPerformed = .now
        PendingSchemePerformances.add(clientUUID)
    }
}
