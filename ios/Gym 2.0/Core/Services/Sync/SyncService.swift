//
//  SyncService.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 04.10.2026.
//

import Foundation
import Observation
import OSLog
import SwiftData

extension Logger {
    static let sync = Logger(subsystem: Bundle.main.bundleIdentifier ?? "Gym 2.0", category: "Sync")
}

/// Keeps the data in SwiftData in sync with the backend. Coordinates the handlers of the single types:
/// `ReferenceDataSync`, `ExerciseSync`, `WorkoutSchemeSync`, `WorkoutSync`, `PendingDeletionSync`, `ChatSync` and
/// `UserSync`. The changes the server rejected are collected in `SyncRejections`.
///
/// A sync first pushes the local changes (syncState and `PendingDeletions`), then pulls what changed on the server
/// since the last sync (the delta routes) and overwrites the local rows that have no unpushed changes. The first pull of
/// every type, and every pull after the server rejected a change, loads everything (the list routes) instead.
///
/// - Workouts in progress are pushed and pulled like finished ones, so they can be continued on another device.
///   The server accepts several workouts in progress, the app asks which one to continue (see MainView).
/// - Creates carry the client UUID of the model, so a create that is sent again after a lost response
///   returns the existing object instead of a duplicate.
/// - A change the server rejects is not sent again: an update or deletion is replaced by the server's version
///   with the next pull, a create stays local. Every rejection is listed in `rejectedChanges` for the user.
/// - `problems` lists what is out of sync right now: a failed sync and the rejected creates that only exist locally.
@MainActor
@Observable
final class SyncService {

    /// Something that is out of sync right now
    struct Problem: Identifiable, Equatable {
        let id: String
        let title: String
        let message: String
        let date: Date
    }

    enum State: Equatable {
        case idle
        case syncing
        /// The last sync stopped (e.g. offline). The local changes are kept and pushed by the next sync.
        case failed(message: String)
    }

    private(set) var state: State = .idle
    private(set) var lastSyncDate: Date?
    /// The changes the server rejected, as messages to show. Kept until `dismissRejectedChanges()` is called.
    var rejectedChanges: [String] { rejections.rejectedChanges }
    /// When the last sync failed, nil once a sync succeeded
    private(set) var failureDate: Date?
    /// The creates the server rejected, by client UUID. They're sent again with every sync and removed once they're
    /// saved or deleted locally.
    var rejectedCreates: [UUID: Problem] { rejections.rejectedCreates }

    /// The current problems, newest first
    var problems: [Problem] {
        var problems = rejectedCreates.values.sorted { $0.date > $1.date }
        if case .failed(let message) = state {
            let problem = Problem(
                id: "syncFailed",
                title: "Sync failed",
                message: "\(message)\n\nYour changes are kept on this device and uploaded with the next sync.",
                date: failureDate ?? .now
            )
            problems.insert(problem, at: 0)
        }
        return problems
    }

    @ObservationIgnored private let context: ModelContext
    @ObservationIgnored private let authService: AuthService
    /// Observable itself, `rejectedChanges` and `rejectedCreates` are tracked through it
    @ObservationIgnored private let rejections: SyncRejections
    @ObservationIgnored private let referenceDataSync: ReferenceDataSync
    @ObservationIgnored private let exerciseSync: ExerciseSync
    @ObservationIgnored private let workoutSchemeSync: WorkoutSchemeSync
    @ObservationIgnored private let workoutSync: WorkoutSync
    @ObservationIgnored private let deletionSync: PendingDeletionSync
    @ObservationIgnored private let chatSync: ChatSync
    @ObservationIgnored private let userSync: UserSync
    @ObservationIgnored private let imageService: ImageService

    @ObservationIgnored private var runningSync: Task<Void, Never>?
    @ObservationIgnored private var syncAgain = false
    @ObservationIgnored private var pullRequested = false
    @ObservationIgnored private var fullPullRequested = false
    @ObservationIgnored private var scheduledSync: Task<Void, Never>?
    @ObservationIgnored private var lastPullDate: Date?
    @ObservationIgnored private var isSavingOwnChanges = false
    @ObservationIgnored private var saveObserver: NSObjectProtocol?

    /// The user whose data is stored, see checkUser()
    private static let syncUserIdKey = "syncUserId"
    /// Local changes are pushed this long after the last save, so that e.g. typing doesn't send a request per character
    private static let pushDelay: Duration = .seconds(3)
    /// A sync started by a local change only pulls if the last pull is older than this
    private static let pullInterval: TimeInterval = 60

    init(context: ModelContext, authService: AuthService, exerciseService: ExerciseService, workoutService: WorkoutService, workoutSchemeService: WorkoutSchemeService, chatService: ChatService, userService: UserService, friendService: FriendService, imageService: ImageService) {
        self.context = context
        self.imageService = imageService
        self.authService = authService
        let rejections = SyncRejections(context: context)
        self.rejections = rejections
        referenceDataSync = ReferenceDataSync(context: context, exerciseService: exerciseService)
        exerciseSync = ExerciseSync(context: context, exerciseService: exerciseService, rejections: rejections)
        workoutSchemeSync = WorkoutSchemeSync(context: context, workoutSchemeService: workoutSchemeService, rejections: rejections)
        workoutSync = WorkoutSync(context: context, workoutService: workoutService, rejections: rejections)
        deletionSync = PendingDeletionSync(exerciseService: exerciseService, workoutService: workoutService, workoutSchemeService: workoutSchemeService, rejections: rejections)
        chatSync = ChatSync(context: context, chatService: chatService)
        userSync = UserSync(context: context, userService: userService, friendService: friendService)

        // Delivered synchronously on the saving thread, so that the saves of the sync itself can be ignored
        saveObserver = NotificationCenter.default.addObserver(forName: ModelContext.didSave, object: context, queue: nil) { [weak self] _ in
            guard Thread.isMainThread else { return }
            MainActor.assumeIsolated {
                self?.contextDidSave()
            }
        }
    }

    // MARK: - Starting a sync

    /// Pushes the local changes and pulls the changes of the server. If a sync is already running, it runs once more
    /// afterwards. Returns when everything is done.
    func sync() async {
        await sync(pull: true)
    }

    /// For when something got out of sync: pushes all local changes first and then loads everything from the server
    /// again (the full lists instead of the deltas). The local objects with changes the server rejected stay as they are.
    /// If the push fails (e.g. offline), nothing is pulled and `state` is `.failed`.
    func resync() async {
        fullPullRequested = true
        await sync(pull: true)
    }

    /// Whether there are local changes the next sync would push.
    var hasUnpushedChanges: Bool {
        guard PendingDeletions.all.isEmpty, PendingSchemePerformances.all.isEmpty else { return true }
        do {
            return try context.fetchAll(Exercise.self).contains { $0.syncState != .synced }
                || context.fetchAll(WorkoutScheme.self).contains { $0.syncState != .synced }
                || context.fetchAll(Workout.self).contains { workout in
                    workout.syncState != .synced || workout.workoutExercises.contains { $0.syncState != .synced }
                }
                || context.fetchAll(User.self).contains { $0.isCurrentUser && $0.syncState != .synced }
                || context.fetchAll(Chat.self).contains { $0.inputUUID != nil }
        } catch {
            return true
        }
    }

    /// Pushes the local changes, e.g. before a logout. Returns false if some are still not on the server afterwards
    /// (offline, or a create the server rejected).
    func pushPendingChanges() async -> Bool {
        guard hasUnpushedChanges else { return true }
        await sync(pull: false)
        return !hasUnpushedChanges
    }

    /// Syncs a moment after the last call, used after local changes.
    func scheduleSync() {
        scheduledSync?.cancel()
        scheduledSync = Task { [weak self] in
            try? await Task.sleep(for: Self.pushDelay)
            guard !Task.isCancelled, let self else { return }
            let pull = self.lastPullDate.map { Date.now.timeIntervalSince($0) > Self.pullInterval } ?? true
            await self.sync(pull: pull)
        }
    }

    private func sync(pull: Bool) async {
        pullRequested = pullRequested || pull
        if let runningSync {
            syncAgain = true
            await runningSync.value
            return
        }
        let task = Task {
            repeat {
                syncAgain = false
                let pull = pullRequested
                let fullPull = fullPullRequested
                pullRequested = false
                fullPullRequested = false
                await syncOnce(pull: pull, fullPull: fullPull)
            } while syncAgain
            // Cleared in the task, so that a sync requested from now on starts a new one instead of waiting for this one
            runningSync = nil
        }
        runningSync = task
        await task.value
    }

    /// Sends the text in the input field of the chat right away. If the server can't be reached, the message is kept
    /// and sent with the next sync.
    func sendMessage(in chat: Chat) async {
        if chat.inputUUID == nil {
            chat.inputUUID = UUID()
        }
        save()
        do {
            if let rejected = try await chatSync.send(chat) {
                report(rejected)
            }
        } catch {
            Logger.sync.error("Sending a message failed: \(error.localizedDescription, privacy: .public)")
        }
        save()
    }

    /// Only the chats and their new members, e.g. to poll for new messages while a chat is open. There are no push updates yet.
    func syncChats() async {
        guard authService.state != .signedOut, !LegacyV2Data.exists else { return }
        do {
            try await chatSync.pushMessages().forEach(report)
            try await chatSync.pull()
            // The full sync loads the users itself, both at once would insert a new member twice
            if runningSync == nil {
                try await userSync.loadMissingMembers()
            }
        } catch {
            Logger.sync.error("Syncing the chats failed: \(error.localizedDescription, privacy: .public)")
        }
        save()
    }

    /// Loads the profiles of the members of a chat again and whether they are friends, e.g. regularly while the chat
    /// is open (`syncChats()` doesn't, the backend has no delta for users). Failures are only logged.
    func refreshMembers(of chat: Chat) async {
        guard authService.state != .signedOut, !LegacyV2Data.exists else { return }
        // The full sync loads the users itself
        guard runningSync == nil else { return }
        do {
            try await userSync.refreshMembers(of: chat)
        } catch {
            Logger.sync.error("Loading the members of the chat \(chat.serverId) failed: \(error.localizedDescription, privacy: .public)")
        }
        save()
    }

    /// Sends a photo with an optional caption right away. Throws if it couldn't be sent, photos aren't kept for the next sync.
    func sendPhoto(_ upload: ImageUpload, caption: String?, in chat: Chat) async throws {
        defer { save() }
        try await chatSync.sendPhoto(upload, caption: caption, to: chat)
    }

    /// Marks the newest message of the chat as read. Failures are ignored, it's tried again the next time.
    func markRead(_ chat: Chat) async {
        guard let userId = authService.currentUser?.id else { return }
        do {
            try await chatSync.markRead(chat, userId: userId)
        } catch {
            Logger.sync.error("Marking the chat \(chat.serverId) as read failed: \(error.localizedDescription, privacy: .public)")
        }
        save()
    }

    /// Stores a chat the server returned after creating, changing or joining it, and loads its members
    func store(_ dto: ChatDTO) async {
        do {
            try chatSync.store(dto)
            save()
            if runningSync == nil {
                try await userSync.loadMissingMembers()
            }
        } catch {
            Logger.sync.error("Storing the chat \(dto.id) failed: \(error.localizedDescription, privacy: .public)")
        }
        save()
    }

    /// Deletes the data of the user from this device, after a logout or the deletion of the account. The sync that is
    /// running finishes first, so that it doesn't store anything afterwards. Call it once the user is signed out.
    func deleteLocalData() async {
        scheduledSync?.cancel()
        await runningSync?.value
        do {
            try removeLocalData()
        } catch {
            Logger.sync.error("Deleting the local data failed: \(error.localizedDescription, privacy: .public)")
        }
        UserDefaults.standard.removeObject(forKey: Self.syncUserIdKey)
        CreateExerciseDraft.remove()
        await imageService.removeAll()
        rejections.dismiss()
        state = .idle
        failureDate = nil
        lastSyncDate = nil
    }

    /// Called after the user has seen the rejected changes
    func dismissRejectedChanges() {
        rejections.dismiss()
    }

    private func report(_ message: String) {
        rejections.report(message)
    }

    private func contextDidSave() {
        guard !isSavingOwnChanges, authService.state != .signedOut else { return }
        scheduleSync()
    }

    // MARK: - Sync

    private func syncOnce(pull: Bool, fullPull: Bool = false) async {
        // The legacy data has to be imported first, its objects would be created twice otherwise
        guard authService.state != .signedOut, !LegacyV2Data.exists else { return }

        state = .syncing
        Logger.sync.info("Sync started (pull: \(pull), full pull: \(fullPull))")
        do {
            try await checkUser()

            // Deletions first, so that the indexes of the workout exercises on the server match the local ones.
            // Exercises are deleted after the workouts and the schemes were pushed, the server keeps exercises that
            // are part of a workout or a scheme, e.g. one that was removed from a scheme right before it was deleted.
            try await deletionSync.push([.workoutExercise, .workout, .workoutScheme])
            try await exerciseSync.push()
            save()
            try await workoutSchemeSync.push()
            save()
            try await deletionSync.push([.exercise])
            try await workoutSchemeSync.pushPerformances()
            save()
            try await workoutSync.push()
            save()
            if let rejected = try await userSync.pushSettings() {
                report(rejected)
            }
            try await chatSync.pushMessages().forEach(report)
            save()

            // Only after the push succeeded, so that everything that is pulled already contains the local changes
            if fullPull {
                SyncTime.removeAll()
            }

            // A sync time is removed when the server rejected a change, the full pull then restores the server's version
            if pull || SyncTime.isMissing {
                try await referenceDataSync.pull()
                try await exerciseSync.pull()
                try await workoutSchemeSync.pull()
                try await workoutSync.pull()
                // The users after the chats, the members of new chats are loaded with them
                try await chatSync.pull()
                try await userSync.pull()
                lastPullDate = .now
                save()
                await imageService.prune(keeping: try referencedImageHashes())
            }

            state = .idle
            lastSyncDate = .now
            failureDate = nil
            Logger.sync.info("Sync finished")
        } catch APIError.unauthorized {
            // AuthService shows the login again, the changes are pushed after the next login
            Logger.sync.info("Sync stopped, the session ended")
            save()
            state = .idle
        } catch {
            save()
            Logger.sync.error("Sync failed: \(error.localizedDescription, privacy: .public)")
            state = .failed(message: error.localizedDescription)
            failureDate = .now
        }
        rejections.removeResolvedCreates()
    }

    /// The local data belongs to the user that synced it. When another user logs in, it's removed and loaded again.
    private func checkUser() async throws {
        if authService.currentUser == nil {
            try await authService.refreshCurrentUser()
        }
        guard let userId = authService.currentUser?.id else { return }

        let key = Self.syncUserIdKey
        let previousUserId = UserDefaults.standard.object(forKey: key) as? Int
        if let previousUserId, previousUserId != userId {
            Logger.sync.info("Another user logged in, removing the local data")
            try removeLocalData()
            await imageService.removeAll()
        }
        UserDefaults.standard.set(userId, forKey: key)
    }

    /// The hashes of all images the stored data shows, the cached images of other hashes can be removed
    private func referencedImageHashes() throws -> Set<String> {
        var hashes = Set<String>()
        try context.fetchAll(Exercise.self).forEach { hashes.formUnion($0.imageUrls) }
        try context.fetchAll(User.self).forEach { hashes.formUnion([$0.profileImageUrl, $0.profileIconUrl]) }
        try context.fetchAll(Chat.self).forEach { if let url = $0.imageUrl { hashes.insert(url) } }
        try context.fetchAll(Message.self).forEach { if let url = $0.imageUrl { hashes.insert(url) } }
        try context.fetchAll(Muscle.self).forEach { hashes.insert($0.imageUrl) }
        hashes.remove("")
        return hashes
    }

    private func removeLocalData() throws {
        try context.fetchAll(Workout.self).forEach(context.delete)
        try context.fetchAll(WorkoutScheme.self).forEach(context.delete)
        try context.fetchAll(Exercise.self).forEach(context.delete)
        try context.fetchAll(Chat.self).forEach(context.delete)
        try context.fetchAll(User.self).forEach(context.delete)
        PendingDeletions.removeAll()
        PendingSchemePerformances.removeAll()
        WorkoutLastChange.removeAll()
        SyncTime.removeAll()
        lastPullDate = nil
        rejections.removeAllCreates()
        save()
    }

    private func save() {
        isSavingOwnChanges = true
        defer { isSavingOwnChanges = false }
        do {
            try context.save()
        } catch {
            Logger.sync.error("Saving the synced data failed: \(error.localizedDescription, privacy: .public)")
        }
    }
}
