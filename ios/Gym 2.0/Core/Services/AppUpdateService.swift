//
//  AppUpdateService.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 14.10.2026.
//

import Foundation
import Observation

/// Knows from the API responses whether this app version is still supported.
///
/// - Retired API version (410): `isUpdateRequired`, the app shows only the update screen. Not stored, so the app
///   works offline until the next request is answered with 410 again. The local data is kept.
/// - Deprecated API version (`Deprecation` header): `showsUpdateNotice`, a notice the user can dismiss. Shown at most
///   once per `noticeInterval`, since the header comes with every response.
@MainActor
@Observable
final class AppUpdateService {

    static let appStoreURL = URL(string: "https://apps.apple.com/app/id6695759065")!

    private(set) var isUpdateRequired = false
    var showsUpdateNotice = false

    private static let noticeInterval: TimeInterval = 24 * 60 * 60
    private static let lastNoticeKey = "lastUpdateNoticeDate"

    init(api: APIClient) {
        api.onUpdateRequired = { [weak self] in
            self?.isUpdateRequired = true
        }
        api.onUpdateAvailable = { [weak self] in
            self?.updateAvailable()
        }
    }

    private func updateAvailable() {
        guard !isUpdateRequired, !showsUpdateNotice else { return }
        if let lastNotice = UserDefaults.standard.object(forKey: Self.lastNoticeKey) as? Date,
           Date.now.timeIntervalSince(lastNotice) < Self.noticeInterval {
            return
        }
        UserDefaults.standard.set(Date.now, forKey: Self.lastNoticeKey)
        showsUpdateNotice = true
    }
}
