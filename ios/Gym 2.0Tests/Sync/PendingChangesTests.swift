//
//  PendingChangesTests.swift
//  Gym 2.0Tests
//
//  Created by Colin Rüegg on 21.10.2026.
//
//  The changes the sync keeps in the UserDefaults until the server has them
//

import Foundation
import SwiftData
import Testing
@testable import Gym_2_0

extension GlobalStateTests {

    @MainActor
    @Suite struct PendingChangesTests {

        let globalState = GlobalStateSnapshot()
        let store: TestStore

        init() throws {
            store = try TestStore()
        }

        @Test func keepsPendingDeletionsOnceAndOnlyOfPushedObjects() {
            #expect(PendingDeletions.all.isEmpty)
            PendingDeletions.add(.workout, serverId: 1)
            PendingDeletions.add(.workout, serverId: 1)
            PendingDeletions.add(.exercise, serverId: 1)
            PendingDeletions.add(.workoutScheme, serverId: nil)
            #expect(PendingDeletions.all == [PendingDeletion(kind: .workout, serverId: 1), PendingDeletion(kind: .exercise, serverId: 1)])
            PendingDeletions.remove(PendingDeletion(kind: .workout, serverId: 1))
            #expect(PendingDeletions.all == [PendingDeletion(kind: .exercise, serverId: 1)])
            PendingDeletions.removeAll()
            #expect(PendingDeletions.all.isEmpty)
        }

        @Test func ignoresUnreadablePendingDeletions() {
            UserDefaults.standard.set(Data("garbage".utf8), forKey: "pendingDeletions")
            #expect(PendingDeletions.all.isEmpty)
        }

        @Test func deletesSyncedModelsLocallyAndKeepsTheirServerIds() throws {
            let exercise = store.exercise("Pushed", serverId: 5)
            let local = store.exercise("Local", serverId: nil, syncState: .created)
            let workout = store.workout(serverId: 6, exercises: [(exercise, Sets(reps: [1]))])
            let workoutExercise = workout.workoutExercises[0]
            workoutExercise.serverId = 7
            let scheme = WorkoutScheme(name: "Pull")
            scheme.serverId = 8
            store.context.insert(scheme)
            try store.context.save()

            store.context.deleteSynced(workoutExercise)
            store.context.deleteSynced(workout)
            store.context.deleteSynced(scheme)
            store.context.deleteSynced(exercise)
            store.context.deleteSynced(local)
            try store.context.save()

            #expect(PendingDeletions.all == [
                PendingDeletion(kind: .workoutExercise, serverId: 7),
                PendingDeletion(kind: .workout, serverId: 6),
                PendingDeletion(kind: .workoutScheme, serverId: 8),
                PendingDeletion(kind: .exercise, serverId: 5),
            ])
            #expect(try store.context.fetchAll(Exercise.self).isEmpty)
            #expect(try store.context.fetchAll(Workout.self).isEmpty)
            #expect(PendingDeletion.Kind.workoutExercise.displayName == "exercise of a workout")
        }

        @Test func keepsTheSchemesAWorkoutWasStartedFrom() {
            let scheme = WorkoutScheme(name: "Pull")
            store.context.insert(scheme)
            scheme.markPerformed()
            scheme.markPerformed()
            #expect(scheme.lastPerformed != nil)
            #expect(PendingSchemePerformances.all == [scheme.clientUUID])
            PendingSchemePerformances.remove(scheme.clientUUID)
            #expect(PendingSchemePerformances.all.isEmpty)
        }

        @Test func keepsTheSyncTimesAsTheServerSentThem() {
            #expect(SyncTime.isMissing)
            for type in SyncTime.allCases {
                SyncTime.set("2026-10-15T08:30:00.123456+00:00", for: type)
            }
            #expect(!SyncTime.isMissing)
            #expect(SyncTime.get(.workouts) == "2026-10-15T08:30:00.123456+00:00")
            SyncTime.remove(.chats)
            #expect(SyncTime.isMissing)
            SyncTime.removeAll()
            #expect(SyncTime.allCases.allSatisfy { SyncTime.get($0) == nil })
        }

        // MARK: The last change of a workout in progress, mirrors suggestedWorkoutEnd of web/src/lib/domain/workout.test.ts

        @Test func suggestsTheLastChangeIfItWasMoreThan5MinutesAgo() {
            let workout = store.workout(date: date(2026, 10, 12, 18, 0), inProgress: true)
            let now = date(2026, 10, 13, 9, 0)
            #expect(workout.suggestedEnd(now: now) == nil)

            WorkoutLastChange.record(workout.clientUUID, at: date(2026, 10, 12, 19, 10))
            #expect(workout.suggestedEnd(now: now) == date(2026, 10, 12, 19, 10))
            WorkoutLastChange.record(workout.clientUUID, at: date(2026, 10, 13, 8, 54, 59))
            #expect(workout.suggestedEnd(now: now) != nil)
        }

        @Test func suggestsNothingForARecentOrEarlierLastChange() {
            let workout = store.workout(date: date(2026, 10, 12, 18, 0), inProgress: true)
            let now = date(2026, 10, 13, 9, 0)
            WorkoutLastChange.record(workout.clientUUID, at: date(2026, 10, 13, 8, 55))
            #expect(workout.suggestedEnd(now: now) == nil)
            WorkoutLastChange.record(workout.clientUUID, at: date(2026, 10, 12, 17, 0))
            #expect(workout.suggestedEnd(now: now) == nil)
        }

        @Test func recordsChangesOnlyWhileInProgressAndForgetsThemWhenFinished() {
            let finished = store.workout()
            finished.noteChange()
            #expect(WorkoutLastChange.lastChange(of: finished.clientUUID) == nil)

            let workout = store.workout(date: .now.addingTimeInterval(-3600), inProgress: true, exercises: [(store.exercise(), Sets(reps: [0]))])
            workout.workoutExercises[0].setValue(5, of: .reps, at: 0)
            #expect(WorkoutLastChange.lastChange(of: workout.clientUUID) != nil)
            workout.save(store.context, bodyWeight: 0)
            #expect(WorkoutLastChange.lastChange(of: workout.clientUUID) == nil)
        }

        @Test func addsTheDeletionOfAPushedWorkoutThatEndsEmpty() {
            let workout = store.workout(serverId: 42, exercises: [(store.exercise(), Sets(reps: [0]))])
            workout.workoutExercises[0].serverId = 43
            workout.save(store.context, bodyWeight: 0)
            #expect(workout.isDeleted)
            #expect(PendingDeletions.all == [PendingDeletion(kind: .workoutExercise, serverId: 43), PendingDeletion(kind: .workout, serverId: 42)])
        }
    }
}
