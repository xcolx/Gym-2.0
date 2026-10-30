//
//  WorkoutSync.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 04.10.2026.
//

import Foundation
import OSLog
import SwiftData

/// Pushes the workouts the user created or changed, with their exercises, and pulls the workouts of the server.
/// Workouts in progress are synced like finished ones. Used by `SyncService`.
@MainActor
final class WorkoutSync {

    private let context: ModelContext
    private let workoutService: WorkoutService
    private let rejections: SyncRejections

    init(context: ModelContext, workoutService: WorkoutService, rejections: SyncRejections) {
        self.context = context
        self.workoutService = workoutService
        self.rejections = rejections
    }

    // MARK: - Push

    func push() async throws {
        let pending = try context.fetchAll(Workout.self).filter { workout in
            workout.syncState != .synced || workout.workoutExercises.contains { $0.syncState != .synced }
        }
        for workout in pending {
            do {
                if workout.serverId == nil {
                    try await create(workout)
                } else {
                    try await update(workout)
                }
            } catch {
                guard error.isRejection else { throw error }
                guard !workout.isGone else { continue }
                let restore = workout.serverId != nil
                rejections.didReject(workout, kind: "workout", name: workout.name, error: error, notFound: "WorkoutNotFoundError", syncTime: .workouts)
                if restore && !workout.isGone {
                    workout.workoutExercises.forEach { $0.syncState = .synced }
                }
            }
        }
    }

    private func create(_ workout: Workout) async throws {
        guard let sent = workout.newWorkoutRequest else { return }
        let dto = try await workoutService.create(sent)
        guard !workout.isGone else {
            PendingDeletions.add(.workout, serverId: dto.id)
            return
        }

        if workout.newWorkoutRequest == sent {
            workout.apply(dto, exercises: try context.exercisesByServerId())
            return
        }
        // Changed while it was being sent: keep the local version and update the server with the next sync
        workout.serverId = dto.id
        workout.syncState = .updated
        for workoutExercise in workout.workoutExercises where workoutExercise.serverId == nil {
            if let created = dto.exercises.first(where: { $0.clientUuid == workoutExercise.clientUUID }) {
                workoutExercise.serverId = created.id
                workoutExercise.syncState = .updated
            }
        }
    }

    /// One change of the batch update, with what is needed to check it after the response
    private struct SentChange {
        let workoutExercise: WorkoutExercise
        let index: Int
        let change: WorkoutExerciseChange
    }

    /// Updates the workout, which also finishes or continues it, and its exercises in one request. The exercise
    /// changes are in the local order: an exercise inserted or moved to its index shifts the following ones, so after
    /// each change the exercises up to that index are where they are locally. The server applies all of them or none.
    private func update(_ workout: Workout) async throws {
        guard let serverId = workout.serverId else { return }
        let sent = workout.updateRequest
        let workoutChanged = workout.syncState != .synced

        var changes: [SentChange] = []
        // A change that can't be built ends the list, the exercises after it would get wrong indexes. The workout then
        // stays unsynced like its exercises, and is sent again with the next sync.
        var isComplete = true
        for (index, workoutExercise) in workout.sortedWorkoutExercises.enumerated() {
            guard !workoutExercise.isGone else { continue }

            if workoutExercise.serverId == nil {
                guard var draft = workoutExercise.draft(index: index) else {
                    isComplete = false
                    break
                }
                draft.clientUuid = workoutExercise.clientUUID
                changes.append(SentChange(workoutExercise: workoutExercise, index: index, change: .create(draft)))
            } else if workoutExercise.syncState != .synced, let id = workoutExercise.serverId {
                guard let update = workoutExercise.updateRequest(index: index) else {
                    isComplete = false
                    break
                }
                changes.append(SentChange(workoutExercise: workoutExercise, index: index, change: .update(id: id, update)))
            }
        }
        guard workoutChanged || !changes.isEmpty else { return }

        let dto = try await workoutService.update(id: serverId, with: workoutChanged ? sent : nil, exerciseChanges: changes.map(\.change))
        // Deleted in the meantime: its pending deletion removes the created exercises on the server too
        guard !workout.isGone else { return }

        for sentChange in changes {
            let workoutExercise = sentChange.workoutExercise
            switch sentChange.change {
            case .create(let draft):
                guard let created = dto.exercises.first(where: { $0.clientUuid == workoutExercise.clientUUID }) else { continue }
                guard !workoutExercise.isGone else {
                    PendingDeletions.add(.workoutExercise, serverId: created.id)
                    continue
                }
                workoutExercise.serverId = created.id
                var current = workoutExercise.draft(index: sentChange.index)
                current?.clientUuid = workoutExercise.clientUUID
                workoutExercise.syncState = current == draft ? .synced : .updated
            case .update(_, let update):
                if !workoutExercise.isGone && workoutExercise.updateRequest(index: sentChange.index) == update {
                    workoutExercise.syncState = .synced
                }
            }
        }

        if workoutChanged && isComplete && workout.updateRequest == sent {
            workout.syncState = .synced
        }
    }

    // MARK: - Pull

    func pull() async throws {
        let exercises = try context.exercisesByServerId()
        if let syncTime = SyncTime.get(.workouts) {
            do {
                let delta = try await workoutService.changes(since: syncTime)
                let local = try context.fetchAll(Workout.self)
                for change in delta.updates {
                    let match = local.matching(serverId: change.id, clientUuid: change.workout?.clientUuid)
                    if let workout = change.workout {
                        upsert(workout, into: match, exercises: exercises)
                    } else if let match, match.syncState == .synced {
                        // A workout in progress that is open is closed by WhilstWorkoutView
                        context.delete(match)
                    }
                }
                SyncTime.set(delta.syncTime, for: .workouts)
                return
            } catch {
                guard error.isRejection else { throw error }
            }
        }

        let list = try await workoutService.all()
        let local = try context.fetchAll(Workout.self)
        var kept = Set<PersistentIdentifier>()
        for dto in list.workouts {
            kept.insert(upsert(dto, into: local.matching(serverId: dto.id, clientUuid: dto.clientUuid), exercises: exercises).persistentModelID)
        }
        for workout in local where !workout.isGone && workout.syncState == .synced && !kept.contains(workout.persistentModelID) {
            context.delete(workout)
        }
        SyncTime.set(list.syncTime, for: .workouts)
    }

    /// A workout with local changes isn't overwritten, e.g. the workout in progress while the user enters a set.
    /// Workouts in progress are overwritten otherwise, they may have been changed on another device.
    @discardableResult
    private func upsert(_ dto: WorkoutDTO, into match: Workout?, exercises: [Int: Exercise]) -> Workout {
        let workout: Workout
        if let match, !match.isGone {
            guard match.syncState == .synced, !match.workoutExercises.contains(where: { $0.syncState != .synced }) else {
                if match.serverId == nil {
                    match.serverId = dto.id
                    match.syncState = .updated
                }
                return match
            }
            workout = match
        } else {
            workout = Workout(name: dto.name, date: dto.date, duration: dto.duration, inProgress: dto.inProgress)
            context.insert(workout)
        }

        if !workout.apply(dto, exercises: exercises) {
            Logger.sync.error("The workout \(dto.id) contains an unknown exercise")
        }
        return workout
    }
}
