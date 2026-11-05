//
//  SettingsLabel.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 03.11.2026.
//

import SwiftUI

/// The title of a settings row with its icon in the app color
struct SettingsLabel: View {

    let title: String
    let systemImage: String

    @Environment(UserSettings.self) private var userSettings

    init(_ title: String, systemImage: String) {
        self.title = title
        self.systemImage = systemImage
    }

    var body: some View {
        Label {
            Text(title)
                .foregroundStyle(Color.primary)
        } icon: {
            Image(systemName: systemImage)
                .foregroundStyle(userSettings.appColor)
        }
    }
}
