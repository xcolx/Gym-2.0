//
//  CustomContainer.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 31.08.2024.
//

import Foundation
import OSLog
import SwiftData

extension Logger {
    static let persistence = Logger(subsystem: Bundle.main.bundleIdentifier ?? "Gym 2.0", category: "Persistence")
}

/// Opens the SwiftData store. All data comes from the server, so the container starts empty and is filled by the
/// first sync.
///
/// If the store can't be opened (e.g. a failed migration), the app must not crash on every launch:
/// 1. The store files are moved aside with the date in their name instead of being deleted. They may still contain
///    data that isn't on the server: the changes that weren't uploaded yet, or the local-only V2 data if the V2 → V3
///    migration failed before it wrote `LegacyV2Data.json`. A later version can still recover them.
/// 2. A new, empty store is created and the sync loads the data again.
/// 3. If that fails too (e.g. the disk is full), the data is only kept in memory for this launch.
enum CustomContainer {

    /// Why the store isn't the one of the last launch, shown to the user once
    enum Problem: Equatable {
        /// The store couldn't be opened and was replaced by an empty one
        case reset
        /// Not even a new store could be created, nothing is saved on the device
        case inMemoryOnly

        var title: String {
            switch self {
            case .reset: "Your data was reloaded"
            case .inMemoryOnly: "Your data can't be saved"
            }
        }

        var message: String {
            switch self {
            case .reset:
                "Gym 2.0 couldn't open the data on this device and started with an empty one. Your workouts, schemes and exercises are loaded from your account again. Changes that weren't uploaded yet may be missing."
            case .inMemoryOnly:
                "Gym 2.0 can't store data on this device right now, e.g. because its storage is full. Your changes are uploaded to your account while you're online, but anything not uploaded is lost when the app is closed. Free up some storage and restart the app."
            }
        }
    }

    @MainActor
    static func create() -> (container: ModelContainer, problem: Problem?) {
        let schema = Schema(versionedSchema: CurrentVersionOfSchema.self)
        let configuration = ModelConfiguration()

        do {
            return (try ModelContainer(for: schema, migrationPlan: MyMigrationPlan.self, configurations: configuration), nil)
        } catch {
            Logger.persistence.error("Opening the store failed: \(error.localizedDescription, privacy: .public)")
        }

        moveAside(storeAt: configuration.url)
        do {
            let container = try ModelContainer(for: schema, migrationPlan: MyMigrationPlan.self, configurations: configuration)
            Logger.persistence.info("Started with a new store")
            return (container, .reset)
        } catch {
            Logger.persistence.error("Creating a new store failed: \(error.localizedDescription, privacy: .public)")
        }

        // An in-memory store can always be created, unless the schema itself is broken, which a test would catch
        let inMemory = ModelConfiguration(isStoredInMemoryOnly: true)
        return (try! ModelContainer(for: schema, migrationPlan: MyMigrationPlan.self, configurations: inMemory), .inMemoryOnly)
    }

    /// Renames the store and its write-ahead log files, e.g. "default.store" to "default.store.failed-20261017-142530"
    private static func moveAside(storeAt url: URL) {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyyMMdd-HHmmss"
        let suffix = "failed-\(formatter.string(from: .now))"

        for path in [url.path(percentEncoded: false), url.path(percentEncoded: false) + "-wal", url.path(percentEncoded: false) + "-shm"] {
            guard FileManager.default.fileExists(atPath: path) else { continue }
            do {
                try FileManager.default.moveItem(atPath: path, toPath: "\(path).\(suffix)")
            } catch {
                // Not deleted: creating the new store fails then as well and the app keeps the data in memory
                Logger.persistence.error("Moving \(path, privacy: .public) aside failed: \(error.localizedDescription, privacy: .public)")
            }
        }
    }
}
