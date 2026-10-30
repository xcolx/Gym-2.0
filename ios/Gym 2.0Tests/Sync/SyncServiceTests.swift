//
//  SyncServiceTests.swift
//  Gym 2.0Tests
//
//  Created by Colin Rüegg on 21.10.2026.
//
//  The sync against FakeBackend: pushing local changes, pulling the server's data, and what happens when the server
//  can't be reached or rejects a change. Covers the same ground as web/src/lib/sync/sync-service.test.ts.
//

import Foundation
import SwiftData
import Testing
@testable import Gym_2_0

extension GlobalStateTests {

    @MainActor
    @Suite struct SyncServiceTests {

        let globalState = GlobalStateSnapshot()
        let store: TestStore
        let backend = FakeBackend()

        init() throws {
            store = try TestStore()
        }

        /// A signed in user, the services talk to the fake backend
        func makeSync() async throws -> SyncService {
            let api = StubURLProtocol.client(handler: backend.handle)
            let userService = UserService(api: api)
            let authService = AuthService(api: api, userService: userService)
            try await authService.login(email: "tester@example.com", password: "test-password-1")
            try #require(authService.state == .signedIn)
            return SyncService(
                context: store.context,
                authService: authService,
                exerciseService: ExerciseService(api: api),
                workoutService: WorkoutService(api: api),
                workoutSchemeService: WorkoutSchemeService(api: api),
                chatService: ChatService(api: api),
                userService: userService,
                friendService: FriendService(api: api),
                imageService: ImageService(api: api)
            )
        }

        /// Answers POST /workouts with the workout as the server would create it
        func acceptWorkoutCreates() {
            backend.on("POST", "/workouts") { [backend] request in
                let json = request.json ?? [:]
                let exercises = (json["exercises"] as? [[String: Any]] ?? []).enumerated().map { index, exercise in
                    FakeBackend.WorkoutExerciseJSON(id: 100 + index, clientUUID: exercise["client_uuid"] as? String, exerciseId: exercise["exercise_id"] as? Int ?? 0, index: index, reps: exercise["reps"] as? [Int] ?? [], weights: exercise["weights"] as? [Double] ?? [])
                }
                let workout = FakeBackend.workoutJSON(id: 50, clientUUID: json["client_uuid"] as? String, name: json["name"] as? String ?? "", exercises: exercises)
                backend.serveWorkouts([workout])
                return .json(workout)
            }
        }

        func localWorkout() -> (Workout, Exercise) {
            let squat = store.exercise("Squat", serverId: 7, verified: true)
            let workout = store.workout("Legs", date: isoDate("2026-10-15T08:00:00Z"), duration: 45, syncState: .created, exercises: [(squat, Sets(reps: [5], weights: [100]))])
            return (workout, squat)
        }

        @Test func pushesAWorkoutCreatedOfflineAndStoresTheServerIds() async throws {
            acceptWorkoutCreates()
            let (workout, _) = localWorkout()
            let sync = try await makeSync()
            #expect(sync.hasUnpushedChanges)

            await sync.sync()

            #expect(sync.state == .idle)
            #expect(sync.problems.isEmpty)
            #expect(sync.rejectedChanges.isEmpty)
            #expect(sync.lastSyncDate != nil)
            #expect(!sync.hasUnpushedChanges)

            let sent = try #require(backend.requests("POST", "/workouts").first?.json)
            #expect(sent["client_uuid"] as? String == workout.clientUUID.uuidString)
            #expect(sent["name"] as? String == "Legs")
            #expect(sent["duration"] as? Int == 45)
            let sentExercise = try #require((sent["exercises"] as? [[String: Any]])?.first)
            #expect(sentExercise["exercise_id"] as? Int == 7)
            #expect(sentExercise["client_uuid"] as? String == workout.workoutExercises[0].clientUUID.uuidString)

            // The pull matched the server's workout to the local one instead of adding it again
            let workouts = try store.context.fetchAll(Workout.self)
            #expect(workouts.count == 1)
            #expect(workout.serverId == 50)
            #expect(workout.syncState == .synced)
            #expect(workout.workoutExercises.map(\.serverId) == [100])
            #expect(workout.workoutExercises.map(\.syncState) == [.synced])

            // The pull stored the user and the sync times
            let me = try #require(try store.context.fetchAll(User.self).first { $0.isCurrentUser })
            #expect(me.username == "tester")
            #expect(SyncTime.allCases.allSatisfy { SyncTime.get($0) == "t1" })
            #expect(UserDefaults.standard.object(forKey: "syncUserId") as? Int == 1)
        }

        @Test func keepsTheLocalChangesWhileOffline() async throws {
            let (workout, _) = localWorkout()
            let sync = try await makeSync()
            backend.offline = true

            await sync.sync()

            #expect(sync.state == .failed(message: "Could not reach the server. Please check your internet connection."))
            #expect(sync.problems.map(\.id) == ["syncFailed"])
            #expect(workout.serverId == nil)
            #expect(workout.syncState == .created)
            #expect(sync.hasUnpushedChanges)
            #expect(try store.context.fetchAll(Workout.self).count == 1)

            // Pushed by the next sync
            backend.offline = false
            acceptWorkoutCreates()
            await sync.sync()
            #expect(sync.state == .idle)
            #expect(sync.problems.isEmpty)
            #expect(workout.serverId == 50)
        }

        @Test func sendsACreateAgainWithTheSameClientUUIDAfterALostResponse() async throws {
            let (workout, _) = localWorkout()
            var attempts = 0
            backend.on("POST", "/workouts") { request in
                attempts += 1
                throw URLError(.networkConnectionLost)
            }
            let sync = try await makeSync()
            await sync.sync()
            #expect(workout.serverId == nil)

            acceptWorkoutCreates()
            await sync.sync()

            let uuids = backend.requests("POST", "/workouts").map { $0.json?["client_uuid"] as? String }
            #expect(attempts == 1)
            #expect(uuids.count == 2)
            #expect(Set(uuids) == [workout.clientUUID.uuidString])
            #expect(workout.serverId == 50)
            #expect(try store.context.fetchAll(Workout.self).count == 1)
        }

        @Test func keepsACreateTheServerRejectsLocallyAndReportsIt() async throws {
            let (workout, _) = localWorkout()
            backend.on("POST", "/workouts") { _ in
                .json(#"{"detail": [{"msg": "Value error, Too many sets"}]}"#, status: 422)
            }
            let sync = try await makeSync()

            await sync.sync()

            // A rejection doesn't stop the sync
            #expect(sync.state == .idle)
            #expect(sync.rejectedChanges == ["The workout “Legs” could not be saved: Too many sets"])
            #expect(sync.problems.map(\.id) == [workout.clientUUID.uuidString])
            #expect(sync.problems.first?.title == "The workout “Legs” is not saved")
            // The full pull doesn't remove it, it only exists locally
            #expect(workout.serverId == nil)
            #expect(!workout.isDeleted)
            #expect(try store.context.fetchAll(Workout.self).count == 1)

            // Reported once, but sent again with every sync
            await sync.sync()
            #expect(backend.requests("POST", "/workouts").count == 2)
            #expect(sync.rejectedChanges.count == 1)

            sync.dismissRejectedChanges()
            #expect(sync.rejectedChanges.isEmpty)

            // Once deleted locally the problem is gone
            store.context.deleteSynced(workout)
            await sync.sync()
            #expect(sync.problems.isEmpty)
        }

        /// A workout that is on the server with one exercise (server id 200), changed locally: renamed, a new exercise
        /// inserted before the existing one, the existing one changed and a new one appended
        func changedWorkout() -> (workout: Workout, inserted: WorkoutExercise, existing: WorkoutExercise, appended: WorkoutExercise) {
            let squat = store.exercise("Squat", serverId: 7, verified: true)
            let workout = store.workout("Legs", date: isoDate("2026-10-15T08:00:00Z"), duration: 45, serverId: 50, syncState: .synced, exercises: [
                (squat, Sets(reps: [1], weights: [10])),
                (squat, Sets(reps: [5, 5], weights: [100, 100])),
                (squat, Sets(reps: [3], weights: [120])),
            ])
            let sorted = workout.sortedWorkoutExercises
            let (inserted, existing, appended) = (sorted[0], sorted[1], sorted[2])
            existing.serverId = 200
            existing.syncState = .updated
            inserted.syncState = .created
            appended.syncState = .created
            workout.name = "Legs 2"
            workout.syncState = .updated
            return (workout, inserted, existing, appended)
        }

        @discardableResult
        func storeServerWorkout() ->() -> FakeBackend.StoredWorkout {
            backend.storeWorkout(FakeBackend.StoredWorkout(id: 50, name: "Legs", exercises: [
                FakeBackend.WorkoutExerciseJSON(id: 200, exerciseId: 7, index: 0, reps: [5], weights: [100]),
            ]))
        }

        @Test func pushesTheChangesOfAWorkoutAndItsExercisesInOneRequest() async throws {
            let serverWorkout = storeServerWorkout()
            let (workout, inserted, existing, appended) = changedWorkout()
            let sync = try await makeSync()

            await sync.sync()

            #expect(sync.state == .idle)
            #expect(sync.rejectedChanges.isEmpty)
            #expect(!sync.hasUnpushedChanges)

            // One request with the workout fields and the exercise changes in the local order
            let requests = backend.requests("PATCH", "/workouts/50")
            #expect(requests.count == 1)
            #expect(!backend.paths.contains { $0.contains("exercise") && !$0.hasPrefix("GET") })
            let sent = try #require(requests.first?.json)
            #expect(sent["name"] as? String == "Legs 2")
            let changes = try #require(sent["exercise_changes"] as? [[String: Any]])
            #expect(changes.map { $0["op"] as? String } == ["create", "update", "create"])
            #expect(changes.map { $0["index"] as? Int } == [0, 1, 2])
            #expect(changes[0]["client_uuid"] as? String == inserted.clientUUID.uuidString)
            #expect(changes[1]["id"] as? Int == 200)
            #expect(changes[1]["reps"] as? [Int] == [5, 5])
            #expect(changes[2]["client_uuid"] as? String == appended.clientUUID.uuidString)

            // The created exercises got their server ids from the response, by client UUID
            #expect(inserted.serverId == 1000)
            #expect(existing.serverId == 200)
            #expect(appended.serverId == 1001)
            #expect(workout.syncState == .synced)
            #expect(workout.workoutExercises.allSatisfy { $0.syncState == .synced })
            // The server has the local order
            let server = serverWorkout()
            #expect(server.name == "Legs 2")
            #expect(server.exercises.sorted { $0.index < $1.index }.map(\.id) == [1000, 200, 1001])
            #expect(server.exercises.first { $0.id == 200 }?.reps == [5, 5])
        }

        @Test func sendsNoWorkoutFieldsWhenOnlyAnExerciseChanged() async throws {
            storeServerWorkout()
            let squat = store.exercise("Squat", serverId: 7, verified: true)
            let workout = store.workout("Legs", serverId: 50, syncState: .synced, exercises: [(squat, Sets(reps: [6], weights: [100]))])
            workout.workoutExercises[0].serverId = 200
            workout.workoutExercises[0].syncState = .updated
            let sync = try await makeSync()

            await sync.sync()

            let sent = try #require(backend.requests("PATCH", "/workouts/50").first?.json)
            #expect(Set(sent.keys) == ["exercise_changes"])
            #expect(workout.workoutExercises[0].syncState == .synced)
            #expect(workout.syncState == .synced)
        }

        @Test func sendsNothingForASyncedWorkout() async throws {
            storeServerWorkout()
            let squat = store.exercise("Squat", serverId: 7, verified: true)
            let workout = store.workout("Legs", serverId: 50, syncState: .synced, exercises: [(squat, Sets(reps: [5], weights: [100]))])
            workout.workoutExercises[0].serverId = 200
            let sync = try await makeSync()

            await sync.sync()

            #expect(backend.requests("PATCH", "/workouts/50").isEmpty)
        }

        @Test func keepsWhatChangedWhileTheBatchWasSentUnsynced() async throws {
            storeServerWorkout()
            let (workout, inserted, existing, appended) = changedWorkout()
            let sync = try await makeSync()
            backend.on("PATCH", "/workouts/50") { _ in
                // Changed locally while the request is on its way
                DispatchQueue.main.sync {
                    MainActor.assumeIsolated {
                        existing.reps = [9, 9]
                        existing.weights = [100, 100]
                        workout.name = "Legs 3"
                        appended.modelContext?.delete(appended)
                    }
                }
                return .json(FakeBackend.workoutJSON(id: 50, clientUUID: nil, name: "Legs 2", exercises: [
                    FakeBackend.WorkoutExerciseJSON(id: 1000, clientUUID: inserted.clientUUID.uuidString, exerciseId: 7, index: 0, reps: [1], weights: [10]),
                    FakeBackend.WorkoutExerciseJSON(id: 200, exerciseId: 7, index: 1, reps: [5, 5], weights: [100, 100]),
                    FakeBackend.WorkoutExerciseJSON(id: 1001, clientUUID: appended.clientUUID.uuidString, exerciseId: 7, index: 2, reps: [3], weights: [120]),
                ]))
            }

            await sync.sync()

            #expect(inserted.serverId == 1000)
            #expect(inserted.syncState == .synced)
            #expect(existing.syncState == .updated)
            #expect(workout.syncState == .updated)
            // Deleted while it was being created: deleted on the server with the next sync
            #expect(PendingDeletions.all.contains { $0.kind == .workoutExercise && $0.serverId == 1001 })
        }

        @Test func aRejectedBatchChangesNothingAndRestoresTheServersVersion() async throws {
            let (workout, inserted, _, _) = changedWorkout()
            // The existing exercise was deleted on the server in the meantime, the whole batch fails
            let serverWorkout = backend.storeWorkout(FakeBackend.StoredWorkout(id: 50, name: "Legs", exercises: []))
            let sync = try await makeSync()

            await sync.sync()

            #expect(sync.state == .idle)
            #expect(backend.requests("PATCH", "/workouts/50").count == 1)
            #expect(sync.rejectedChanges == ["Your changes to the workout \u{201C}Legs 2\u{201D} were undone, because they could not be saved: Workout exercise not found"])
            // Atomic: none of the changes before the failing one was applied
            #expect(serverWorkout().name == "Legs")
            #expect(serverWorkout().exercises.isEmpty)
            // The full pull replaced the local workout with the server's
            #expect(workout.name == "Legs")
            #expect(workout.syncState == .synced)
            #expect(workout.workoutExercises.isEmpty)
            #expect(inserted.isGone)
        }

        @Test func pushesPendingDeletions() async throws {
            PendingDeletions.add(.workout, serverId: 9)
            PendingDeletions.add(.workoutScheme, serverId: 10)
            PendingDeletions.add(.exercise, serverId: 11)
            backend.on("DELETE", "/workouts/9") { _ in .json("{}") }
            // already gone on the server
            backend.on("DELETE", "/workout-schemes/10") { _ in .json(#"{"detail": "Not Found"}"#, status: 404) }
            // kept by the server
            backend.on("DELETE", "/exercises/11") { _ in .json(#"{"error": "ExerciseInUseError", "detail": "The exercise is part of a workout"}"#, status: 409) }
            let sync = try await makeSync()

            await sync.sync()

            #expect(PendingDeletions.all.isEmpty)
            #expect(backend.requests("DELETE", "/workouts/9").count == 1)
            #expect(backend.requests("DELETE", "/workout-schemes/10").count == 1)
            #expect(sync.rejectedChanges == ["A deleted exercise was restored, because it could not be deleted: The exercise is part of a workout"])
            // Workouts and schemes are deleted before the exercises
            let paths = backend.paths
            let exerciseDeletion = try #require(paths.firstIndex(of: "DELETE /exercises/11"))
            #expect(paths.firstIndex(of: "DELETE /workouts/9")! < exerciseDeletion)
            #expect(sync.state == .idle)
        }

        @Test func aFullPullReplacesTheSyncedDataAndKeepsTheUnpushed() async throws {
            let squat = store.exercise("Squat", serverId: 7, verified: true)
            let removedExercise = store.exercise("Removed", serverId: 8, verified: true)
            let removedOnServer = store.workout("Removed", serverId: 77, syncState: .synced, exercises: [(squat, Sets(reps: [1], weights: [1]))])
            backend.serveWorkouts([
                FakeBackend.workoutJSON(id: 80, clientUUID: nil, name: "From the web", exercises: [
                    FakeBackend.WorkoutExerciseJSON(id: 800, exerciseId: 7, index: 0, reps: [3, 2], weights: [60, 65]),
                ]),
            ])
            let sync = try await makeSync()

            await sync.sync()

            #expect(sync.state == .idle)
            #expect(removedOnServer.isDeleted || removedOnServer.modelContext == nil)
            #expect(removedExercise.isDeleted || removedExercise.modelContext == nil)
            let workouts = try store.context.fetchAll(Workout.self)
            #expect(workouts.map(\.name) == ["From the web"])
            let workout = try #require(workouts.first)
            #expect(workout.serverId == 80)
            #expect(workout.syncState == .synced)
            #expect(workout.workoutExercises.first?.exercise === squat)
            #expect(workout.workoutExercises.first?.weights == [60, 65])
            #expect(try store.context.fetchAll(Exercise.self).map(\.name) == ["Squat"])
        }

        @Test func pullsOnlyTheChangesAfterTheFirstSync() async throws {
            for type in SyncTime.allCases {
                SyncTime.set("t0+00:00", for: type)
            }
            let squat = store.exercise("Squat", serverId: 7, verified: true)
            let deleted = store.workout("Deleted", serverId: 77, syncState: .synced, exercises: [(squat, Sets(reps: [1], weights: [1]))])
            backend.on("GET", "/exercises/delta") { _ in .json(#"{"updates": [], "sync_time": "t2"}"#) }
            backend.on("GET", "/workout-schemes/delta") { _ in .json(#"{"updates": [], "sync_time": "t2"}"#) }
            backend.on("GET", "/workouts/delta") { _ in .json(#"{"updates": [{"id": 77, "action": 2}], "sync_time": "t2"}"#) }
            backend.on("GET", "/chats/delta") { _ in .json(#"{"chats": [], "read_states": [], "sync_time": "t2"}"#) }
            let sync = try await makeSync()

            await sync.sync()

            #expect(sync.state == .idle)
            #expect(deleted.isDeleted || deleted.modelContext == nil)
            #expect(SyncTime.allCases.allSatisfy { SyncTime.get($0) == "t2" })
            #expect(backend.requests("GET", "/workouts").isEmpty)
            let query = backend.requests("GET", "/workouts/delta").first?.url.query(percentEncoded: true)
            #expect(query == "last_sync_time=t0%2B00:00")
        }

        @Test func removesTheDataOfAnotherUser() async throws {
            UserDefaults.standard.set(2, forKey: "syncUserId")
            let other = store.workout("Of user 2", serverId: 5, syncState: .synced)
            let unpushed = store.workout("Unpushed of user 2", syncState: .created)
            PendingDeletions.add(.workout, serverId: 6)
            let sync = try await makeSync()

            await sync.sync()

            #expect(other.isDeleted || other.modelContext == nil)
            #expect(unpushed.isDeleted || unpushed.modelContext == nil)
            #expect(backend.requests("POST", "/workouts").isEmpty)
            #expect(backend.requests("DELETE", "/workouts/6").isEmpty)
            #expect(UserDefaults.standard.object(forKey: "syncUserId") as? Int == 1)
        }

        @Test func doesNothingWhileSignedOut() async throws {
            let api = StubURLProtocol.client(handler: backend.handle)
            let userService = UserService(api: api)
            let authService = AuthService(api: api, userService: userService)
            #expect(authService.state == .signedOut)
            let sync = SyncService(context: store.context, authService: authService, exerciseService: ExerciseService(api: api), workoutService: WorkoutService(api: api), workoutSchemeService: WorkoutSchemeService(api: api), chatService: ChatService(api: api), userService: userService, friendService: FriendService(api: api), imageService: ImageService(api: api))
            _ = localWorkout()

            await sync.sync()

            #expect(backend.paths.isEmpty)
            #expect(sync.state == .idle)
        }

        @Test func waitsForTheImportOfTheLegacyData() async throws {
            try LegacyV2Data(exercises: [], workouts: [], schemes: []).write()
            _ = localWorkout()
            let sync = try await makeSync()

            await sync.sync()

            #expect(backend.paths == ["POST /auth/login/email", "GET /users/me"])
        }
    }
}
