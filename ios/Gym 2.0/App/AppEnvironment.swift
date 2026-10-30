//
//  AppEnvironment.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 04.10.2026.
//

import Foundation
import SwiftData

/// Builds the API client and the services once. Views get the services through `.environment(...)`.
@MainActor
final class AppEnvironment {
    let api: APIClient
    let userService: UserService
    let authService: AuthService
    let appUpdateService: AppUpdateService
    let exerciseService: ExerciseService
    let workoutService: WorkoutService
    let workoutSchemeService: WorkoutSchemeService
    let friendService: FriendService
    let chatService: ChatService
    let reportService: ReportService
    let aiService: AIService
    let imageService: ImageService
    let legacyImportService: LegacyImportService
    let syncService: SyncService

    init(context: ModelContext, api: APIClient = APIClient()) {
        self.api = api
        userService = UserService(api: api)
        friendService = FriendService(api: api)
        authService = AuthService(api: api, userService: userService)
        appUpdateService = AppUpdateService(api: api)
        exerciseService = ExerciseService(api: api)
        workoutService = WorkoutService(api: api)
        workoutSchemeService = WorkoutSchemeService(api: api)
        chatService = ChatService(api: api)
        reportService = ReportService(api: api)
        aiService = AIService(api: api)
        imageService = ImageService(api: api)
        legacyImportService = LegacyImportService(exerciseService: exerciseService, workoutService: workoutService, workoutSchemeService: workoutSchemeService)
        syncService = SyncService(context: context, authService: authService, exerciseService: exerciseService, workoutService: workoutService, workoutSchemeService: workoutSchemeService, chatService: chatService, userService: userService, friendService: friendService, imageService: imageService)
    }
}
