//
//  SyncRejections.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 04.10.2026.
//

import Foundation
import Observation
import OSLog
import SwiftData

/// The changes the server rejected: the messages to show (`rejectedChanges`) and the rejected creates that only
/// exist locally (`rejectedCreates`). Shared by the sync handlers, `SyncService` publishes them.
@MainActor
@Observable
final class SyncRejections {

    /// The changes the server rejected, as messages to show. Kept until `dismiss()` is called.
    private(set) var rejectedChanges: [String] = []
    /// The creates the server rejected, by client UUID. They're sent again with every sync and removed once they're
    /// saved or deleted locally.
    private(set) var rejectedCreates: [UUID: SyncService.Problem] = [:]

    @ObservationIgnored private let context: ModelContext

    init(context: ModelContext) {
        self.context = context
    }

    func report(_ message: String) {
        guard !rejectedChanges.contains(message) else { return }
        rejectedChanges.append(message)
    }

    /// Called after the user has seen the rejected changes
    func dismiss() {
        rejectedChanges = []
    }

    /// Forgets the rejected creates, e.g. when the local data is removed
    func removeAllCreates() {
        rejectedCreates = [:]
    }

    /// The server rejected a change. A create stays local, an update is replaced by the server's version with the
    /// next (full) pull, and an object that doesn't exist on the server anymore is removed.
    /// `notFound` is the backend's error for the object itself, a 404 can also be about an object it references.
    func didReject(_ model: some ServerSynced, kind: String, name: String, error: Error, notFound: String, syncTime: SyncTime) {
        Logger.sync.error("The server rejected the \(kind, privacy: .public) \(name, privacy: .public): \(error.localizedDescription, privacy: .public)")
        if model.serverId == nil {
            // A rejected create is sent again with every sync, it's only reported once
            if rejectedCreates[model.clientUUID] == nil {
                report("The \(kind) “\(name)” could not be saved: \(error.localizedDescription)")
            }
            rejectedCreates[model.clientUUID] = SyncService.Problem(
                id: model.clientUUID.uuidString,
                title: "The \(kind) “\(name)” is not saved",
                message: "\(error.localizedDescription)\n\nIt only exists on this device and is sent again with every sync. Change or delete it to fix this.",
                date: rejectedCreates[model.clientUUID]?.date ?? .now
            )
        } else if case APIError.server(404, let code, _) = error, code == notFound {
            report("The \(kind) “\(name)” doesn't exist anymore, your changes to it were discarded.")
            context.delete(model)
        } else {
            report("Your changes to the \(kind) “\(name)” were undone, because they could not be saved: \(error.localizedDescription)")
            model.syncState = .synced
            SyncTime.remove(syncTime)
        }
    }

    /// Removes the rejected creates that were saved in the meantime or deleted locally
    func removeResolvedCreates() {
        guard !rejectedCreates.isEmpty else { return }
        do {
            let exercises: [any ServerSynced] = try context.fetchAll(Exercise.self)
            let schemes: [any ServerSynced] = try context.fetchAll(WorkoutScheme.self)
            let workouts: [any ServerSynced] = try context.fetchAll(Workout.self)
            let unsaved = Set((exercises + schemes + workouts).filter { $0.serverId == nil && !$0.isGone }.map { $0.clientUUID })
            rejectedCreates = rejectedCreates.filter { unsaved.contains($0.key) }
        } catch {
            Logger.sync.error("Checking the rejected creates failed: \(error.localizedDescription, privacy: .public)")
        }
    }
}
