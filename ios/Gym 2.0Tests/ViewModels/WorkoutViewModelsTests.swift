//
//  WorkoutViewModelsTests.swift
//  Gym 2.0Tests
//
//  Created by Colin Rüegg on 24.10.2026.
//
//  Editing the workout in progress, ending it, and the past workouts: continuing, repeating, editing and deleting them
//

import Foundation
import SwiftData
import Testing
@testable import Gym_2_0

extension GlobalStateTests {

    /// The changes note the last change of the workout and the deletions are recorded in the UserDefaults
    @MainActor
    @Suite struct WorkoutViewModelsTests {

        let globalState = GlobalStateSnapshot()
        let store: TestStore
        var workouts: WorkoutRepository { WorkoutRepository(context: store.context) }

        init() throws {
            store = try TestStore()
        }

        func inProgress(_ exercises: [(Exercise, Sets)], serverId: Int? = nil, startedAgo minutes: Double = 30) -> Workout {
            store.workout(
                "Push", date: Date.now.addingTimeInterval(-minutes * 60), duration: 0, inProgress: true,
                serverId: serverId, exercises: exercises
            )
        }

        func names(_ workout: Workout) -> [String] {
            workout.workoutExercises.sorted { $0.index < $1.index }.map { $0.exercise?.name ?? "" }
        }

        // MARK: - EditPerformingWorkoutViewModel

        @Test func renamesTheWorkoutWithTheTrimmedTitle() throws {
            let workout = inProgress([(store.exercise("Bench Press"), Sets(reps: [0]))], serverId: 5)
            let model = EditPerformingWorkoutViewModel(workout: workout, defersDeletions: false, workouts: workouts)
            model.onAppear()
            #expect(model.title == "Push")

            model.title = "  Chest Day "
            model.titleChanged()

            #expect(workout.name == "Chest Day")
            #expect(workout.syncState == .updated)
            #expect(workout.workoutExercises.allSatisfy { $0.syncState == .synced })
            #expect(WorkoutLastChange.lastChange(of: workout.clientUUID) != nil)
        }

        @Test func keepsTheLastNameWhileTheTitleIsEmptyAndShortensLongTitles() {
            let workout = inProgress([])
            let model = EditPerformingWorkoutViewModel(workout: workout, defersDeletions: false, workouts: workouts)

            model.title = "   "
            model.titleChanged()
            #expect(workout.name == "Push")

            model.title = String(repeating: "a", count: 30)
            model.titleChanged()
            #expect(model.title.count == Workout.maxNameLength)
            #expect(workout.name == String(repeating: "a", count: Workout.maxNameLength))
        }

        @Test func addsThePickedExercisesAfterTheOthersWithOneSet() {
            let workout = inProgress([(store.exercise("Bench Press"), Sets(reps: [10], weights: [60]))])
            let squat = store.exercise("Squat")
            let model = EditPerformingWorkoutViewModel(workout: workout, defersDeletions: false, workouts: workouts)

            model.exercisesToAdd = [squat]
            model.addPickedExercises(bodyWeight: 70)

            #expect(names(workout) == ["Bench Press", "Squat"])
            #expect(model.sortedExercises.last?.entryCount == 1)
            #expect(model.exercisesToAdd.isEmpty)
        }

        @Test func deletesExercisesAlsoOnTheServerAndKeepsTheIndicesConsecutive() throws {
            let exercises = ["Bench Press", "Fly", "Dips"].map { store.exercise($0) }
            let workout = inProgress(exercises.map { ($0, Sets(reps: [10])) }, serverId: 5)
            workout.workoutExercises.first { $0.exercise?.name == "Fly" }?.serverId = 77
            try store.context.save()
            let model = EditPerformingWorkoutViewModel(workout: workout, defersDeletions: false, workouts: workouts)

            model.deleteItems(at: IndexSet(integer: 1))

            #expect(names(workout) == ["Bench Press", "Dips"])
            #expect(model.sortedExercises.map(\.index) == [0, 1])
            #expect(PendingDeletions.all == [PendingDeletion(kind: .workoutExercise, serverId: 77)])
        }

        @Test func defersTheDeletionWhileEditingAPastWorkout() throws {
            let exercises = ["Bench Press", "Fly"].map { store.exercise($0) }
            let workout = inProgress(exercises.map { ($0, Sets(reps: [10])) })
            workout.workoutExercises.first { $0.exercise?.name == "Bench Press" }?.serverId = 77
            let model = EditPerformingWorkoutViewModel(workout: workout, defersDeletions: true, workouts: workouts)

            model.deleteItems(at: IndexSet(integer: 0))

            #expect(names(workout) == ["Fly"])
            #expect(model.sortedExercises.map(\.index) == [0])
            #expect(PendingDeletions.all.isEmpty)
        }

        @Test func movesAnExerciseAndMarksTheMovedOnesChanged() {
            let exercises = ["Bench Press", "Fly", "Dips"].map { store.exercise($0) }
            let workout = inProgress(exercises.map { ($0, Sets(reps: [10])) }, serverId: 5)
            let model = EditPerformingWorkoutViewModel(workout: workout, defersDeletions: false, workouts: workouts)

            model.move(indices: IndexSet(integer: 2), newOffset: 0)

            #expect(names(workout) == ["Dips", "Bench Press", "Fly"])
            #expect(model.sortedExercises.map(\.syncState) == [.updated, .updated, .updated])
        }

        // MARK: - EndWorkoutViewModel

        @Test func asksBeforeDiscardingAWorkoutWithoutEnteredValues() {
            let workout = inProgress([(store.exercise("Bench Press"), Sets(reps: [0], weights: [0]))])
            let model = EndWorkoutViewModel(workout: workout, workouts: workouts)

            #expect(model.requestEnd(bodyWeight: 70) == nil)

            #expect(model.asksToDiscardEmpty)
            #expect(workout.inProgress)
        }

        @Test func endsTheWorkoutRightAwayAndRemovesTheEmptySets() throws {
            let workout = inProgress([
                (store.exercise("Bench Press"), Sets(reps: [10, 0], weights: [60, 0])),
                (store.exercise("Fly"), Sets(reps: [0], weights: [0])),
            ], startedAgo: 45)
            let model = EndWorkoutViewModel(workout: workout, workouts: workouts)

            let outcome = model.requestEnd(bodyWeight: 70)

            #expect(outcome == .ended(duration: 45))
            #expect(!workout.inProgress)
            #expect(names(workout) == ["Bench Press"])
            #expect(workout.workoutExercises.first?.reps == [10])
        }

        @Test func suggestsTheLastChangeAsEndIfItWasLongAgo() {
            let workout = inProgress([(store.exercise("Bench Press"), Sets(reps: [10]))], startedAgo: 120)
            let lastChange = Date.now.addingTimeInterval(-60 * 60)
            WorkoutLastChange.record(workout.clientUUID, at: lastChange)
            let model = EndWorkoutViewModel(workout: workout, workouts: workouts)

            #expect(model.requestEnd(bodyWeight: 70) == nil)
            #expect(model.suggestedEnd == lastChange)

            #expect(model.end(at: lastChange, bodyWeight: 70) == .ended(duration: 60))
            #expect(WorkoutLastChange.lastChange(of: workout.clientUUID) == nil)
        }

        @Test func endsAtNowIfTheLastChangeWasJustNow() {
            let workout = inProgress([(store.exercise("Bench Press"), Sets(reps: [10]))], startedAgo: 20)
            WorkoutLastChange.record(workout.clientUUID, at: .now.addingTimeInterval(-60))
            let model = EndWorkoutViewModel(workout: workout, workouts: workouts)

            #expect(model.requestEnd(bodyWeight: 70) == .ended(duration: 20))
            #expect(model.suggestedEnd == nil)
        }

        @Test func discardingDeletesTheWorkoutAlsoOnTheServer() throws {
            let workout = inProgress([(store.exercise("Bench Press"), Sets(reps: [0]))], serverId: 9)
            try store.context.save()
            WorkoutLastChange.record(workout.clientUUID)
            let clientUUID = workout.clientUUID
            let model = EndWorkoutViewModel(workout: workout, workouts: workouts)

            model.discard()

            #expect(try store.context.fetchAll(Workout.self).isEmpty)
            #expect(PendingDeletions.all == [PendingDeletion(kind: .workout, serverId: 9)])
            #expect(WorkoutLastChange.lastChange(of: clientUUID) == nil)
        }

        // MARK: - PastWorkoutDetailViewModel

        @Test func continuesAPastWorkoutWhereItsTimerStopped() throws {
            let workout = store.workout("Legs", duration: 40, serverId: 3)
            WorkoutLastChange.record(workout.clientUUID)
            try store.context.save()
            let model = PastWorkoutDetailViewModel(workouts: workouts)

            #expect(model.continueWorkout(workout))

            #expect(workout.inProgress)
            #expect(abs(workout.date.timeIntervalSinceNow + 40 * 60) < 5)
            #expect(workout.syncState == .updated)
            #expect(WorkoutLastChange.lastChange(of: workout.clientUUID) == nil)
        }

        @Test func doesntContinueOrRepeatWhileAnotherWorkoutIsInProgress() throws {
            let bench = store.exercise("Bench Press")
            let past = store.workout("Legs", exercises: [(bench, Sets(reps: [10]))])
            _ = inProgress([])
            try store.context.save()
            let model = PastWorkoutDetailViewModel(workouts: workouts)

            #expect(!model.continueWorkout(past))
            #expect(!past.inProgress)
            #expect(model.exercisesToRepeat(past) == nil)
        }

        @Test func repeatsTheExercisesInTheirOrderWithoutTheDeletedOnes() throws {
            let exercises = ["Squat", "Lunge", "Leg Press"].map { store.exercise($0) }
            let past = store.workout("Legs", exercises: exercises.map { ($0, Sets(reps: [10])) })
            past.workoutExercises.first { $0.exercise?.name == "Squat" }?.index = 5
            try store.context.save()
            store.context.delete(exercises[1])
            try store.context.save()
            let model = PastWorkoutDetailViewModel(workouts: workouts)

            #expect(model.exercisesToRepeat(past)?.map(\.name) == ["Leg Press", "Squat"])
        }

        @Test func deletesAPastWorkoutAlsoOnTheServer() throws {
            let workout = store.workout("Legs", serverId: 3)
            try store.context.save()

            PastWorkoutDetailViewModel(workouts: workouts).delete(workout)

            #expect(try store.context.fetchAll(Workout.self).isEmpty)
            #expect(PendingDeletions.all == [PendingDeletion(kind: .workout, serverId: 3)])
        }

        // MARK: - EditPastWorkoutViewModel

        func pastWorkout() throws -> Workout {
            let workout = store.workout(
                "Push", duration: 50, serverId: 3,
                exercises: [
                    (store.exercise("Bench Press"), Sets(reps: [10], weights: [60])),
                    (store.exercise("Fly"), Sets(reps: [12], weights: [20])),
                ]
            )
            for (index, workoutExercise) in workout.workoutExercises.enumerated() {
                workoutExercise.serverId = 100 + index
            }
            try store.context.save()
            return workout
        }

        func editModel(_ workout: Workout) -> EditPastWorkoutViewModel {
            EditPastWorkoutViewModel(workout: workout, container: store.container, workouts: workouts)
        }

        @Test func changesNothingUntilItIsSaved() throws {
            let original = try pastWorkout()
            let model = editModel(original)

            model.workout.name = "Changed"
            model.workout.workoutExercises.first?.reps = [99]

            #expect(original.name == "Push")
            #expect(original.workoutExercises.allSatisfy { $0.reps != [99] })
            #expect(original.syncState == .synced)
        }

        @Test func savesOnlyWhatChanged() throws {
            let original = try pastWorkout()
            let model = editModel(original)
            model.onAppear()
            #expect(model.enteredTime == "50")

            model.workout.name = " Chest "
            model.enteredTime = "65"
            model.enteredTimeChanged()
            let bench = model.workout.workoutExercises.first { $0.exercise?.name == "Bench Press" }!
            bench.reps = [12]
            model.save()

            #expect(original.name == "Chest")
            #expect(original.duration == 65)
            #expect(original.syncState == .updated)
            let saved = Dictionary(uniqueKeysWithValues: original.workoutExercises.map { ($0.exercise!.name, $0) })
            #expect(saved["Bench Press"]?.reps == [12])
            #expect(saved["Bench Press"]?.syncState == .updated)
            #expect(saved["Fly"]?.syncState == .synced)
        }

        @Test func savesRemovedAndAddedExercises() throws {
            let original = try pastWorkout()
            let squat = store.exercise("Squat")
            try store.context.save()
            let model = editModel(original)

            let fly = model.workout.workoutExercises.first { $0.exercise?.name == "Fly" }!
            model.workout.workoutExercises.removeAll { $0 == fly }
            model.editContext.delete(fly)
            let squatCopy = model.editContext.model(for: squat.persistentModelID) as! Exercise
            model.workout.addExercises([squatCopy], bodyWeight: 70)
            model.workout.workoutExercises.last?.reps = [5]
            model.save()

            #expect(Set(original.workoutExercises.compactMap { $0.exercise?.name }) == ["Bench Press", "Squat"])
            #expect(original.workoutExercises.first { $0.exercise?.name == "Squat" }?.reps == [5])
            #expect(PendingDeletions.all == [PendingDeletion(kind: .workoutExercise, serverId: 101)])
        }

        @Test func limitsTheDurationToADayAndRestoresAnInvalidOne() throws {
            let model = editModel(try pastWorkout())
            model.onAppear()

            model.enteredTime = "2000"
            model.enteredTimeChanged()
            #expect(model.workout.duration == Workout.maxDuration)
            #expect(model.enteredTime == String(Workout.maxDuration))

            model.enteredTime = "1h"
            model.enteredTimeChanged()
            #expect(model.enteredTime == String(Workout.maxDuration))

            // Empty while typing, the value returns once the field is left
            model.enteredTime = ""
            model.enteredTimeChanged()
            #expect(model.enteredTime == "")
            model.timeFieldLeft()
            #expect(model.enteredTime == String(Workout.maxDuration))
        }

        @Test func doesntSaveAnEmptyName() throws {
            let original = try pastWorkout()
            let model = editModel(original)

            model.workout.name = "  "
            model.workout.duration = 10
            model.save()

            #expect(original.name == "Push")
            #expect(original.duration == 50)
        }
    }
}

@MainActor
@Suite struct StopwatchStoreTests {

    let store: TestStore
    let key: StopwatchStore.Key

    init() throws {
        store = try TestStore()
        let workout = store.workout(exercises: [(store.exercise(tracksReps: false, tracksWeights: false, tracksTime: true), Sets(time: [0]))])
        try store.context.save()
        key = StopwatchStore.Key(workoutExercise: workout.workoutExercises[0].persistentModelID, set: 0)
    }

    @Test func startsPausedAtTheTimeOfTheField() {
        let stopwatch = StopwatchStore().stopwatch(for: key, fieldSeconds: 90)

        #expect(!stopwatch.isRunning)
        #expect(stopwatch.elapsed(at: .now) == 90)
    }

    @Test func measuresFromTheTimeOfTheField() throws {
        let stopwatches = StopwatchStore()

        stopwatches.start(key, fieldSeconds: 30)
        let running = stopwatches.stopwatch(for: key, fieldSeconds: 0)
        let startedAt = try #require(running.startedAt)

        #expect(running.elapsed(at: startedAt.addingTimeInterval(15)) == 45)
        // Starting again doesn't restart it
        stopwatches.start(key, fieldSeconds: 0)
        #expect(stopwatches.stopwatch(for: key, fieldSeconds: 0).startedAt == startedAt)
    }

    @Test func pausesAndResumesWithTheMeasuredTime() {
        let stopwatches = StopwatchStore()
        stopwatches.start(key, fieldSeconds: 30)

        stopwatches.pause(key, fieldSeconds: 0)
        let paused = stopwatches.stopwatch(for: key, fieldSeconds: 0)
        #expect(!paused.isRunning)
        #expect(paused.accumulated >= 30 && paused.accumulated < 31)

        stopwatches.start(key, fieldSeconds: 0)
        #expect(stopwatches.stopwatch(for: key, fieldSeconds: 0).accumulated == paused.accumulated)
    }

    @Test func stopReturnsTheTimeAndRemovesTheStopwatch() {
        let stopwatches = StopwatchStore()
        stopwatches.start(key, fieldSeconds: 30)

        let measured = stopwatches.stop(key, fieldSeconds: 0)

        #expect(measured >= 30 && measured < 31)
        #expect(!stopwatches.stopwatch(for: key, fieldSeconds: 12).isRunning)
        #expect(stopwatches.stopwatch(for: key, fieldSeconds: 12).accumulated == 12)
    }

    @Test func keepsAStopwatchPerSet() {
        let stopwatches = StopwatchStore()
        let otherSet = StopwatchStore.Key(workoutExercise: key.workoutExercise, set: 1)

        stopwatches.start(key, fieldSeconds: 0)

        #expect(stopwatches.stopwatch(for: key, fieldSeconds: 0).isRunning)
        #expect(!stopwatches.stopwatch(for: otherSet, fieldSeconds: 0).isRunning)
    }
}
