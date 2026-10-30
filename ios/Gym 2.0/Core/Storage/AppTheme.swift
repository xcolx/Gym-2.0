//
//  AppTheme.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 14.10.2026.
//

import SwiftUI
import UIKit

/// Light, dark or the system appearance. Only stored on the device in the UserDefaults, not synced to the server.
enum AppTheme: String, CaseIterable, Identifiable {
    case system
    case light
    case dark

    static let storageKey = "appTheme"

    var id: Self { self }

    var title: String {
        switch self {
        case .system: "System"
        case .light: "Light"
        case .dark: "Dark"
        }
    }

    var interfaceStyle: UIUserInterfaceStyle {
        switch self {
        case .system: .unspecified
        case .light: .light
        case .dark: .dark
        }
    }
}

extension UIApplication {
    /// Set on the windows instead of with .preferredColorScheme, so that it also applies to sheets and switches back
    /// to the system appearance reliably
    func apply(_ theme: AppTheme) {
        for case let scene as UIWindowScene in connectedScenes {
            for window in scene.windows {
                window.overrideUserInterfaceStyle = theme.interfaceStyle
            }
        }
    }
}
