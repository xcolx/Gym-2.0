//
//  Gym_2_0App.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 11.08.24.
//

import SwiftUI
import SwiftData

@main
struct Gym_2_0App: App {
    
    // Created once, since the body can be evaluated more than once.
    let container: ModelContainer
    /// Set if the store couldn't be opened, see CustomContainer
    let containerProblem: CustomContainer.Problem?
    let userSettings: UserSettings
    let workoutTotals: WorkoutTotals
    let appEnvironment: AppEnvironment

    @AppStorage(AppTheme.storageKey) private var theme: AppTheme = .system

    init() {
        // The container has to be created first: its migration writes the legacy V2 data that AppEnvironment checks for.
        (container, containerProblem) = CustomContainer.create()
        appEnvironment = AppEnvironment(context: container.mainContext)
        userSettings = UserSettings(context: container.mainContext)
        workoutTotals = WorkoutTotals(context: container.mainContext)
    }
    
    var body: some Scene {
        WindowGroup {
            RootView(containerProblem: containerProblem)
                .onAppear {
                    UIApplication.shared.addKeyboardDismissGestureRecognizers()
                    UIApplication.shared.apply(theme)
                }
                .onChange(of: theme) { UIApplication.shared.apply(theme) }
                .environment(userSettings)
                .environment(workoutTotals)
                .environment(appEnvironment.authService)
                .environment(appEnvironment.appUpdateService)
                .environment(appEnvironment.legacyImportService)
                .environment(appEnvironment.syncService)
                .environment(\.imageService, appEnvironment.imageService)
                .environment(\.aiService, appEnvironment.aiService)
                .environment(\.userService, appEnvironment.userService)
                .environment(\.friendService, appEnvironment.friendService)
                .environment(\.chatService, appEnvironment.chatService)
                .environment(\.reportService, appEnvironment.reportService)
                .task { await appEnvironment.authService.restoreSession() }
        }
        .modelContainer(container)
    }
}

// Gestures to close the keyboard for the whole app: a tap anywhere or a swipe down
extension UIApplication {
    func addKeyboardDismissGestureRecognizers() {
        guard let window = (connectedScenes.first as? UIWindowScene)?.windows.first else { return }
        let tapGesture = UITapGestureRecognizer(target: window, action: #selector(UIView.endEditing))
        tapGesture.requiresExclusiveTouchType = false
        tapGesture.cancelsTouchesInView = false
        tapGesture.delegate = self
        window.addGestureRecognizer(tapGesture)

        let swipeGesture = UISwipeGestureRecognizer(target: window, action: #selector(UIView.endEditing))
        swipeGesture.direction = .down
        swipeGesture.cancelsTouchesInView = false
        swipeGesture.delegate = self
        window.addGestureRecognizer(swipeGesture)
    }
}

extension UIApplication: @retroactive UIGestureRecognizerDelegate {
    public func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer) -> Bool {
        // The swipe has to work together with scrolling, e.g. in a chat or a form
        return gestureRecognizer is UISwipeGestureRecognizer
    }
}
