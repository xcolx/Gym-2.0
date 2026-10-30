//
//  UpdateRequiredView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 14.10.2026.
//

import SwiftUI

/// Shown instead of the app when the backend no longer supports this app version. The data on this device is kept
/// and uploaded by the updated app.
struct UpdateRequiredView: View {

    @Environment(UserSettings.self) private var userSettings

    var body: some View {
        VStack(spacing: 20) {
            Spacer()
            Image(systemName: "arrow.down.app")
                .font(.system(size: 64))
                .foregroundStyle(.tint)
            Text("Update required")
                .font(.title2.bold())
                .multilineTextAlignment(.center)
            Text("This version of Gym 2.0 is no longer supported. Please update the app in the App Store to continue. Your data on this device is kept and uploaded after the update.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
            Spacer()
            Link(destination: AppUpdateService.appStoreURL) {
                Label("Open App Store", systemImage: "arrow.up.forward.app")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .tint(userSettings.appColor)
    }
}
