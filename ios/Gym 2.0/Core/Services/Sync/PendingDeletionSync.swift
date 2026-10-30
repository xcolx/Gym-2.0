//
//  PendingDeletionSync.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 04.10.2026.
//

import Foundation
import OSLog

/// Pushes the deletions of `PendingDeletions`. Used by `SyncService`.
@MainActor
final class PendingDeletionSync {

    private let exerciseService: ExerciseService
    private let workoutService: WorkoutService
    private let workoutSchemeService: WorkoutSchemeService
    private let rejections: SyncRejections

    init(exerciseService: ExerciseService, workoutService: WorkoutService, workoutSchemeService: WorkoutSchemeService, rejections: SyncRejections) {
        self.exerciseService = exerciseService
        self.workoutService = workoutService
        self.workoutSchemeService = workoutSchemeService
        self.rejections = rejections
    }

    func push(_ kinds: Set<PendingDeletion.Kind>) async throws {
        for deletion in PendingDeletions.all where kinds.contains(deletion.kind) {
            do {
                switch deletion.kind {
                case .exercise: try await exerciseService.delete(id: deletion.serverId)
                case .workout: try await workoutService.delete(id: deletion.serverId)
                case .workoutExercise: try await workoutService.deleteExercise(id: deletion.serverId)
                case .workoutScheme: try await workoutSchemeService.delete(id: deletion.serverId)
                }
            } catch {
                guard error.isRejection else { throw error }
                // 404: it's already gone. Otherwise the server keeps it (e.g. an exercise that is part of a workout)
                // and the full pull brings it back.
                if (error as? APIError)?.status != 404 {
                    Logger.sync.error("The server rejected the deletion of \(deletion.kind.rawValue, privacy: .public) \(deletion.serverId): \(error.localizedDescription, privacy: .public)")
                    SyncTime.remove(deletion.kind == .exercise ? .exercises : deletion.kind == .workoutScheme ? .workoutSchemes : .workouts)
                    rejections.report("A deleted \(deletion.kind.displayName) was restored, because it could not be deleted: \(error.localizedDescription)")
                }
            }
            PendingDeletions.remove(deletion)
        }
    }
}
