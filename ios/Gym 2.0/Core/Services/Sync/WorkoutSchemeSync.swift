//
//  WorkoutSchemeSync.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 04.10.2026.
//

import Foundation
import OSLog
import SwiftData

/// Pushes the workout schemes the user created or changed and the pending performances (`PendingSchemePerformances`),
/// and pulls the schemes of the server. Used by `SyncService`.
@MainActor
final class WorkoutSchemeSync {

    private let context: ModelContext
    private let workoutSchemeService: WorkoutSchemeService
    private let rejections: SyncRejections

    init(context: ModelContext, workoutSchemeService: WorkoutSchemeService, rejections: SyncRejections) {
        self.context = context
        self.workoutSchemeService = workoutSchemeService
        self.rejections = rejections
    }

    // MARK: - Push

    func push() async throws {
        for scheme in try context.fetchAll(WorkoutScheme.self) where scheme.syncState != .synced {
            do {
                if let serverId = scheme.serverId {
                    guard let sent = scheme.updateRequest else { continue }
                    let dto = try await workoutSchemeService.update(id: serverId, with: sent)
                    guard !scheme.isGone else { continue }
                    if scheme.updateRequest == sent {
                        scheme.apply(dto, exercises: try context.exercisesByServerId())
                    }
                } else {
                    guard let sent = scheme.newSchemeRequest else { continue }
                    let dto = try await workoutSchemeService.create(sent)
                    guard !scheme.isGone else {
                        PendingDeletions.add(.workoutScheme, serverId: dto.id)
                        continue
                    }
                    if scheme.newSchemeRequest == sent {
                        scheme.apply(dto, exercises: try context.exercisesByServerId())
                    } else {
                        scheme.serverId = dto.id
                        scheme.syncState = .updated
                    }
                }
            } catch {
                guard error.isRejection else { throw error }
                guard !scheme.isGone else { continue }
                rejections.didReject(scheme, kind: "workout scheme", name: scheme.name, error: error, notFound: "WorkoutSchemeNotFoundError", syncTime: .workoutSchemes)
            }
        }
    }

    /// Sets the last performed date of the schemes a workout was started from. After the schemes were pushed,
    /// so that the ones created offline have a server id.
    func pushPerformances() async throws {
        let pending = PendingSchemePerformances.all
        guard !pending.isEmpty else { return }
        let schemes = try context.fetchAll(WorkoutScheme.self)
        for clientUUID in pending {
            guard let scheme = schemes.first(where: { $0.clientUUID == clientUUID }), !scheme.isGone else {
                // Deleted in the meantime
                PendingSchemePerformances.remove(clientUUID)
                continue
            }
            // A create the server rejected, sent again once the scheme is saved
            guard let serverId = scheme.serverId else { continue }
            do {
                let dto = try await workoutSchemeService.markPerformed(id: serverId)
                if !scheme.isGone {
                    scheme.lastPerformed = dto.lastPerformed
                }
            } catch {
                guard error.isRejection else { throw error }
                Logger.sync.error("The server rejected the last performed date of the workout scheme \(serverId): \(error.localizedDescription, privacy: .public)")
            }
            PendingSchemePerformances.remove(clientUUID)
        }
    }

    // MARK: - Pull

    func pull() async throws {
        let exercises = try context.exercisesByServerId()
        if let syncTime = SyncTime.get(.workoutSchemes) {
            do {
                let delta = try await workoutSchemeService.changes(since: syncTime)
                let local = try context.fetchAll(WorkoutScheme.self)
                for change in delta.updates {
                    let match = local.matching(serverId: change.id, clientUuid: change.scheme?.clientUuid)
                    if let scheme = change.scheme {
                        upsert(scheme, into: match, exercises: exercises)
                    } else if let match, match.syncState == .synced {
                        context.delete(match)
                    }
                }
                SyncTime.set(delta.syncTime, for: .workoutSchemes)
                return
            } catch {
                guard error.isRejection else { throw error }
            }
        }

        let list = try await workoutSchemeService.all()
        let local = try context.fetchAll(WorkoutScheme.self)
        var kept = Set<PersistentIdentifier>()
        for dto in list.schemes {
            kept.insert(upsert(dto, into: local.matching(serverId: dto.id, clientUuid: dto.clientUuid), exercises: exercises).persistentModelID)
        }
        for scheme in local where !scheme.isGone && scheme.syncState == .synced && !kept.contains(scheme.persistentModelID) {
            context.delete(scheme)
        }
        SyncTime.set(list.syncTime, for: .workoutSchemes)
    }

    @discardableResult
    private func upsert(_ dto: WorkoutSchemeDTO, into match: WorkoutScheme?, exercises: [Int: Exercise]) -> WorkoutScheme {
        let scheme: WorkoutScheme
        if let match, !match.isGone {
            guard match.syncState == .synced else {
                if match.serverId == nil {
                    match.serverId = dto.id
                    match.syncState = .updated
                }
                return match
            }
            scheme = match
        } else {
            scheme = WorkoutScheme(name: dto.name)
            context.insert(scheme)
        }
        if !scheme.apply(dto, exercises: exercises) {
            Logger.sync.error("The workout scheme \(dto.id) contains an unknown exercise")
        }
        return scheme
    }
}
