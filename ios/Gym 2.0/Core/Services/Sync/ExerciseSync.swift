//
//  ExerciseSync.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 04.10.2026.
//

import Foundation
import OSLog
import SwiftData

/// Pushes the exercises the user created or changed, with their new images, and pulls the exercises of the server.
/// Used by `SyncService`.
@MainActor
final class ExerciseSync {

    private let context: ModelContext
    private let exerciseService: ExerciseService
    private let rejections: SyncRejections

    init(context: ModelContext, exerciseService: ExerciseService, rejections: SyncRejections) {
        self.context = context
        self.exerciseService = exerciseService
        self.rejections = rejections
    }

    // MARK: - Push

    func push() async throws {
        for exercise in try context.fetchAll(Exercise.self) where exercise.syncState != .synced {
            let sent = exercise.draft
            let sentImages = exercise.pendingImages
            do {
                if let serverId = exercise.serverId {
                    let (dto, uploaded) = try await sendExercise(sent, images: sentImages) { draft, images in
                        try await self.exerciseService.update(id: serverId, with: draft, images: images)
                    }
                    guard !exercise.isGone else { continue }
                    didPush(exercise, sent: sent, sentImages: sentImages, uploaded: uploaded, response: dto)
                } else {
                    let (dto, uploaded) = try await sendExercise(sent, images: sentImages) { draft, images in
                        try await self.exerciseService.create(draft, images: images)
                    }
                    guard !exercise.isGone else {
                        // Deleted while it was being created
                        PendingDeletions.add(.exercise, serverId: dto.id)
                        continue
                    }
                    didPush(exercise, sent: sent, sentImages: sentImages, uploaded: uploaded, response: dto)
                }
            } catch {
                guard error.isRejection else { throw error }
                guard !exercise.isGone else { continue }
                rejections.didReject(exercise, kind: "exercise", name: exercise.name, error: error, notFound: "ExerciseNotFoundError", syncTime: .exercises)
            }
        }
    }

    /// Sends the exercise with its new images, the ones that aren't an image the server takes are left out. If the
    /// server rejects it with the images, it's sent again without them. `uploaded`: how many new images the server
    /// received, they are the last of `dto.imageUrls`.
    private func sendExercise(_ draft: ExerciseDraft, images: [Data], _ send: (ExerciseDraft, [ImageUpload]) async throws -> ExerciseDTO) async throws -> (dto: ExerciseDTO, uploaded: Int) {
        let uploads = images.compactMap(ImageUpload.init(detecting:))
        guard !uploads.isEmpty else {
            return (try await send(draft, []), 0)
        }
        do {
            return (try await send(draft, uploads), uploads.count)
        } catch {
            guard error.isRejection, (error as? APIError)?.status != 404 else { throw error }
            Logger.sync.error("The server rejected the images of the exercise \(draft.name, privacy: .public): \(error.localizedDescription, privacy: .public)")
            return (try await send(draft, []), 0)
        }
    }

    /// The sent pending images are uploaded images now (or were rejected by the server), the images added since stay
    /// pending. If the pending images were changed otherwise in the meantime, all of them are sent again.
    private func didPush(_ exercise: Exercise, sent: ExerciseDraft, sentImages: [Data], uploaded: Int, response dto: ExerciseDTO) {
        let imagesKept = exercise.pendingImages.starts(with: sentImages)
        if exercise.draft == sent && imagesKept && exercise.pendingImages.count == sentImages.count {
            exercise.pendingImages = []
            exercise.apply(dto)
        } else {
            // Changed again while it was being sent
            exercise.serverId = dto.id
            if imagesKept {
                exercise.imageUrls += dto.imageUrls.suffix(uploaded)
                exercise.pendingImages.removeFirst(sentImages.count)
            }
            exercise.syncState = .updated
        }
    }

    // MARK: - Pull

    func pull() async throws {
        if let syncTime = SyncTime.get(.exercises) {
            do {
                let delta = try await exerciseService.changes(since: syncTime)
                let local = try context.fetchAll(Exercise.self)
                for change in delta.updates {
                    let match = local.matching(serverId: change.exercise.id, clientUuid: change.exercise.clientUuid)
                    if change.action == .deleted {
                        if let match, match.syncState == .synced { context.delete(match) }
                    } else {
                        upsert(change.exercise, into: match)
                    }
                }
                SyncTime.set(delta.syncTime, for: .exercises)
                return
            } catch {
                // e.g. a sync time the server doesn't accept anymore, load everything instead
                guard error.isRejection else { throw error }
            }
        }

        let list = try await exerciseService.all()
        let local = try context.fetchAll(Exercise.self)
        var kept = Set<PersistentIdentifier>()
        for dto in list.exercises {
            kept.insert(upsert(dto, into: local.matching(serverId: dto.id, clientUuid: dto.clientUuid)).persistentModelID)
        }
        for exercise in local where !exercise.isGone && exercise.syncState == .synced && !kept.contains(exercise.persistentModelID) {
            context.delete(exercise)
        }
        SyncTime.set(list.syncTime, for: .exercises)
    }

    @discardableResult
    private func upsert(_ dto: ExerciseDTO, into match: Exercise?) -> Exercise {
        guard let match, !match.isGone else {
            let exercise = Exercise(dto)
            context.insert(exercise)
            return exercise
        }
        if match.syncState == .synced {
            match.apply(dto)
        } else if match.serverId == nil {
            // Created, but the response got lost. The local changes are sent as an update.
            match.serverId = dto.id
            match.syncState = .updated
        }
        return match
    }
}
