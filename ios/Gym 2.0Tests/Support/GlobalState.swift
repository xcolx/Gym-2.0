//
//  GlobalState.swift
//  Gym 2.0Tests
//
//  Created by Colin Rüegg on 21.10.2026.
//
//  Some parts of the app keep their state outside of SwiftData: in the UserDefaults (pending deletions, sync times, ...)
//  and in Application Support (the legacy V2 data). The tests are hosted by the app, so they share that state with it.
//  The tests that use it run one after another inside `GlobalStateTests`, start without it and put back what was there.
//

import Foundation
import Testing
@testable import Gym_2_0

/// The parent of every suite that uses the UserDefaults or the legacy data file, nested suites run one after another
@Suite(.serialized)
struct GlobalStateTests {}

/// Clears the global state when created and restores it with `restore()`
final class GlobalStateSnapshot {

    static let defaultsKeys = ["pendingDeletions", "pendingSchemePerformances", "syncUserId", "workoutLastChange"]
        + SyncTime.allCases.map { "syncTime.\($0.rawValue)" }

    private var defaults: [String: Any] = [:]
    private var legacyData: Data?

    init() {
        for key in Self.defaultsKeys {
            defaults[key] = UserDefaults.standard.object(forKey: key)
            UserDefaults.standard.removeObject(forKey: key)
        }
        legacyData = try? Data(contentsOf: LegacyV2Data.fileURL)
        try? FileManager.default.removeItem(at: LegacyV2Data.fileURL)
    }

    func restore() {
        for key in Self.defaultsKeys {
            if let value = defaults[key] {
                UserDefaults.standard.set(value, forKey: key)
            } else {
                UserDefaults.standard.removeObject(forKey: key)
            }
        }
        try? FileManager.default.removeItem(at: LegacyV2Data.fileURL)
        if let legacyData {
            try? legacyData.write(to: LegacyV2Data.fileURL)
        }
    }

    deinit {
        restore()
    }
}
