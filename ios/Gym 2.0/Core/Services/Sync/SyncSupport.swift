//
//  SyncSupport.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 04.10.2026.
//

import Foundation
import SwiftData

// The helpers the sync handlers share.

extension Error {
    /// A 4xx the server will answer the same way again. Timeouts and rate limits are worth retrying later.
    var isRejection: Bool {
        guard case .server(let status, _, _) = self as? APIError else { return false }
        return (400..<500).contains(status) && status != 408 && status != 429
    }
}

extension ModelContext {
    func fetchAll<Model: PersistentModel>(_ type: Model.Type) throws -> [Model] {
        try fetch(FetchDescriptor<Model>())
    }

    /// The stored exercises that are on the server, to resolve the exercise ids of workouts and schemes
    func exercisesByServerId() throws -> [Int: Exercise] {
        Dictionary(try fetchAll(Exercise.self).compactMap { exercise in exercise.serverId.map { ($0, exercise) } }, uniquingKeysWith: { first, _ in first })
    }
}

/// The sync time the server sent with the last pull, per type. Kept as the server sent it to not lose precision.
enum SyncTime: String, CaseIterable {
    case exercises, workoutSchemes, workouts, chats

    private var key: String { "syncTime.\(rawValue)" }

    static func get(_ type: SyncTime) -> String? {
        UserDefaults.standard.string(forKey: type.key)
    }

    static func set(_ syncTime: String, for type: SyncTime) {
        UserDefaults.standard.set(syncTime, forKey: type.key)
    }

    static func remove(_ type: SyncTime) {
        UserDefaults.standard.removeObject(forKey: type.key)
    }

    static func removeAll() {
        allCases.forEach(remove)
    }

    static var isMissing: Bool {
        allCases.contains { get($0) == nil }
    }
}

// MARK: - Synced models

/// The models that can be changed offline
protocol ServerSynced: PersistentModel {
    var serverId: Int? { get set }
    var clientUUID: UUID { get }
    var syncState: SyncState { get set }
}

extension ServerSynced {
    /// Deleted locally, e.g. while a request for it was running
    var isGone: Bool {
        isDeleted || modelContext == nil
    }
}

extension Exercise: ServerSynced {}
extension Workout: ServerSynced {}
extension WorkoutExercise: ServerSynced {}
extension WorkoutScheme: ServerSynced {}

extension Array where Element: ServerSynced {
    /// By server id first, by client UUID second (a create whose response got lost)
    func matching(serverId: Int, clientUuid: UUID?) -> Element? {
        first { $0.serverId == serverId } ?? first { $0.serverId == nil && $0.clientUUID == clientUuid }
    }
}
