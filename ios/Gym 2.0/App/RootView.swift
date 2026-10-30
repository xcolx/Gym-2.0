//
//  RootView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 05.10.2026.
//

import SwiftUI

/// Login first, then the import of the V2 data if there is any, then the app. Only the update screen once the
/// backend no longer supports this app version.
struct RootView: View {

    /// Shown once after the launch, see CustomContainer
    let containerProblem: CustomContainer.Problem?
    @State private var showsContainerProblem = true

    @Environment(AuthService.self) private var authService
    @Environment(LegacyImportService.self) private var legacyImportService
    @Environment(AppUpdateService.self) private var appUpdateService
    @Environment(\.openURL) private var openURL

    var body: some View {
        @Bindable var appUpdateService = appUpdateService
        Group {
            if appUpdateService.isUpdateRequired {
                UpdateRequiredView()
            } else {
                switch authService.state {
                case .signedOut:
                    AuthView()
                // While restoring, the stored session is used offline, like a signed in one
                case .restoring, .signedIn:
                    if legacyImportService.isPending {
                        LegacyImportView()
                    } else {
                        MainView()
                    }
                }
            }
        }
        .animation(.default, value: authService.state)
        .animation(.default, value: legacyImportService.isPending)
        .animation(.default, value: appUpdateService.isUpdateRequired)
        .alert("Update available", isPresented: $appUpdateService.showsUpdateNotice) {
            Button("Later", role: .cancel) {}
            Button("Open App Store") {
                openURL(AppUpdateService.appStoreURL)
            }
        } message: {
            Text("A new version of Gym 2.0 is available in the App Store.")
        }
        .alert(containerProblem?.title ?? "", isPresented: Binding(get: { containerProblem != nil && showsContainerProblem }, set: { showsContainerProblem = $0 })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(containerProblem?.message ?? "")
        }
    }
}
