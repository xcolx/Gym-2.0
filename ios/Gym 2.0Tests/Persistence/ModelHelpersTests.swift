//
//  ModelHelpersTests.swift
//  Gym 2.0Tests
//
//  Created by Colin Rüegg on 21.10.2026.
//
//  Core/Persistence/Extensions. Mirrors web/src/lib/domain/workout-exercise.test.ts and workout.test.ts
//

import Foundation
import SwiftData
import Testing
@testable import Gym_2_0

@MainActor
struct WorkoutExerciseHelpersTests {

    let store: TestStore

    init() throws {
        store = try TestStore()
        store.insertReferenceData()
    }

    func workoutExercise(_ sets: Sets, exercise: Exercise? = nil) -> WorkoutExercise {
        let workout = store.workout(exercises: [(exercise ?? store.exercise(), sets)])
        return workout.workoutExercises[0]
    }

    @Test func startsWithOneEmptyEntryPerTrackedMetricTwoIfUnilateral() {
        let bodyweight = store.exercise("Dips", equipmentId: 2, tracksTime: true)
        let entry = workoutExercise(Sets(), exercise: bodyweight)
        entry.startSets(bodyWeight: 80)
        #expect(entry.reps == [0])
        #expect(entry.weights == [80])
        #expect(entry.time == [0])
        #expect(entry.intensity == nil)
        #expect(entry.distance == nil)

        let unilateral = workoutExercise(Sets(unilateral: true))
        unilateral.startSets(bodyWeight: 80)
        #expect(unilateral.entryCount == 2)
        // only bodyweight exercises start with the bodyweight
        #expect(unilateral.weights == [0, 0])
    }

    @Test func appendsAndRemovesEntriesInEveryTrackedMetric() {
        let entry = workoutExercise(Sets(reps: [10], weights: [50]))
        entry.syncState = .synced
        entry.appendEntry(bodyWeight: 0)
        #expect(entry.reps == [10, 0])
        #expect(entry.weights == [50, 0])
        #expect(entry.syncState == .updated)

        let other = workoutExercise(Sets(reps: [1, 2, 3], weights: [4, 5, 6]))
        other.removeEntry(at: 1)
        #expect(other.reps == [1, 3])
        #expect(other.weights == [4, 6])
    }

    @Test func countsSetsAUnilateralSetHasTwoEntries() {
        #expect(workoutExercise(Sets(reps: [1, 2, 3, 4])).getNumberOfSets() == 4)
        #expect(workoutExercise(Sets(reps: [1, 2, 3, 4], unilateral: true)).getNumberOfSets() == 2)
        #expect(workoutExercise(Sets(time: [1, 2])).entryCount == 2)
        #expect(workoutExercise(Sets()).entryCount == 0)
    }

    @Test func convertsTheEntriesWhenSwitchingUnilateral() {
        let entry = workoutExercise(Sets(reps: [10, 8], weights: [50, 60]))
        entry.setUnilateral(true)
        #expect(entry.unilateral)
        #expect(entry.reps == [10, 0, 8, 0])
        #expect(entry.weights == [50, 0, 60, 0])
        entry.setUnilateral(true)
        #expect(entry.reps == [10, 0, 8, 0])
        entry.setUnilateral(false)
        #expect(entry.reps == [10, 8])
        #expect(entry.weights == [50, 60])
    }

    @Test func roundsRepsAndTimeAndIgnoresUntrackedMetrics() {
        let entry = workoutExercise(Sets(reps: [0], weights: [0]))
        entry.setValue(7.5, of: .reps, at: 0)
        entry.setValue(7.5, of: .weights, at: 0)
        entry.setValue(30, of: .time, at: 0)
        #expect(entry.reps == [8])
        #expect(entry.weights == [7.5])
        #expect(entry.time == nil)
        #expect(entry.value(of: .reps, at: 0) == 8)
        #expect(entry.value(of: .time, at: 0) == nil)
    }

    @Test func treatsTheUnchangedBodyweightAsNotEntered() {
        let pullUp = store.exercise("Pull Up", equipmentId: 3)
        #expect(workoutExercise(Sets(reps: [0], weights: [80]), exercise: pullUp).isEntryEmpty(at: 0, bodyWeight: 80))
        #expect(!workoutExercise(Sets(reps: [0], weights: [80])).isEntryEmpty(at: 0, bodyWeight: 80))
        #expect(!workoutExercise(Sets(reps: [1], weights: [80]), exercise: pullUp).isEntryEmpty(at: 0, bodyWeight: 80))
    }

    @Test func knowsTheTrackedMetricsAndTheVolume() {
        let entry = workoutExercise(Sets(reps: [10, 5], weights: [50, 100]))
        #expect(entry.trackedMetrics == [.reps, .weights])
        #expect(entry.volume == 1000)
        #expect(entry.totalReps == 15)
        #expect(workoutExercise(Sets(reps: [10])).volume == 0)
    }

    @Test func describesAnEntryInTheUnitsOfTheUser() {
        let entry = workoutExercise(Sets(reps: [10, 9], weights: [50, 50], unilateral: true))
        #expect(entry.entryDescription(at: 0, weightUnit: .metric, distanceUnit: .metric) == "R 10x, 50.0 kg")
        #expect(entry.entryDescription(at: 1, weightUnit: .metric, distanceUnit: .metric) == "L 9x, 50.0 kg")
        let run = workoutExercise(Sets(time: [90], distance: [1500]))
        #expect(run.entryDescription(at: 0, weightUnit: .metric, distanceUnit: .metric) == "1:30, 1.5 km")
        let intensity = workoutExercise(Sets(intensity: [5.5]))
        #expect(intensity.entryDescription(at: 0, weightUnit: .imperial, distanceUnit: .imperial) == "lvl 5.5")
    }

    @Test func hasTheLimitsOfTheServer() {
        #expect(SetMetric.reps.range == 0...999)
        #expect(SetMetric.reps.serverRange == 0...9999)
        #expect(SetMetric.weights.serverRange.contains(-9999.9))
        #expect(!SetMetric.weights.range.contains(-1))
        #expect(SetMetric.distance.serverRange == SetMetric.distance.range)
    }
}

@MainActor
struct WorkoutHelpersTests {

    let store: TestStore

    init() throws {
        store = try TestStore()
        store.insertReferenceData()
    }

    // MARK: Finishing a workout

    @Test func removesTheEmptyEntriesAndExercisesAndReindexesTheRest() throws {
        let workout = store.workout(date: date(2026, 10, 12, 18, 0), exercises: [
            (store.exercise(), Sets(reps: [0], weights: [0])),
            (store.exercise(), Sets(reps: [10, 0, 8], weights: [50, 0, 50])),
        ])
        workout.inProgress = true
        let empty = workout.sortedWorkoutExercises[0]
        let done = workout.sortedWorkoutExercises[1]

        workout.save(store.context, bodyWeight: 80, end: date(2026, 10, 12, 19, 5, 30))
        #expect(workout.duration == 65)
        #expect(!workout.inProgress)
        #expect(!workout.isDeleted)
        #expect(empty.isDeleted)
        #expect(workout.workoutExercises.count == 1)
        #expect(done.index == 0)
        #expect(done.reps == [10, 8])
        #expect(done.weights == [50, 50])
    }

    @Test func removesUnilateralSetsOnlyIfBothSidesAreEmpty() {
        let workout = store.workout(date: date(2026, 10, 12, 18, 0), exercises: [
            (store.exercise(), Sets(reps: [10, 0, 0, 0, 0, 8], weights: [20, 20, 0, 0, 0, 20], unilateral: true)),
        ])
        workout.save(store.context, bodyWeight: 80, end: date(2026, 10, 12, 19, 0))
        #expect(workout.workoutExercises[0].reps == [10, 0, 0, 8])
    }

    @Test func keepsTheBodyweightOfBodyweightExercisesAsNotEntered() {
        let pullUps = store.exercise("Pull Ups", equipmentId: 3)
        let workout = store.workout(date: date(2026, 10, 12, 18, 0), exercises: [(pullUps, Sets(reps: [0, 5], weights: [80, 80]))])
        #expect(workout.hasEnteredValues(bodyWeight: 80))
        workout.save(store.context, bodyWeight: 80, end: date(2026, 10, 12, 19, 0))
        #expect(workout.workoutExercises[0].reps == [5])
    }

    @Test func deletesTheWorkoutIfNothingWasEntered() {
        let workout = store.workout(date: date(2026, 10, 12, 18, 0), exercises: [(store.exercise(), Sets(reps: [0], weights: [0]))])
        #expect(!workout.hasEnteredValues(bodyWeight: 80))
        workout.save(store.context, bodyWeight: 80, end: date(2026, 10, 12, 19, 0))
        #expect(workout.isDeleted)
    }

    @Test func marksASyncedWorkoutAndItsExercisesAsChanged() {
        let workout = store.workout(date: date(2026, 10, 12, 18, 0), serverId: 1, syncState: .synced, exercises: [(store.exercise(), Sets(reps: [5]))])
        workout.workoutExercises[0].serverId = 2
        workout.save(store.context, bodyWeight: 80, end: date(2026, 10, 12, 18, 30))
        #expect(workout.syncState == .updated)
        #expect(workout.workoutExercises[0].syncState == .updated)
        #expect(workout.duration == 30)
    }

    @Test func createsAWorkoutWithOneEmptySetPerExercise() {
        let workout = Workout.create(name: "Push", exercises: [store.exercise("A"), store.exercise("B", tracksWeights: false)], bodyWeight: 80)
        #expect(workout.name == "Push")
        #expect(workout.inProgress)
        #expect(workout.sortedWorkoutExercises.map { $0.exercise?.name } == ["A", "B"])
        #expect(workout.sortedWorkoutExercises.map(\.reps) == [[0], [0]])
        #expect(workout.sortedWorkoutExercises[1].weights == nil)
    }

    // MARK: Muscles

    func muscleNames(_ muscles: [Muscle]) -> [String] {
        muscles.map(\.name)
    }

    @Test func listsPrimaryMusclesAndTheMusclesOnlyTrainedAsSecondaryMuscle() {
        let bench = store.exercise("Bench", primaryMuscleIds: [1], secondaryMuscleIds: [2, 3])
        let dips = store.exercise("Dips", primaryMuscleIds: [2])
        let workout = store.workout(exercises: [(bench, Sets()), (dips, Sets())])
        let (primary, secondary) = [workout].musclesTrained()
        #expect(muscleNames(primary) == ["Chest", "Triceps"])
        #expect(muscleNames(secondary) == ["Front Deltoid"])
        let (single, singleSecondary) = workout.musclesTrained()
        #expect(Set(muscleNames(single)) == ["Chest", "Triceps"])
        #expect(Set(muscleNames(singleSecondary)) == ["Triceps", "Front Deltoid"])
    }

    @Test func countsAMuscleTrainedAsSecondaryMuscleInThreeExercisesAsPrimary() {
        let fly = store.exercise("Fly", primaryMuscleIds: [1], secondaryMuscleIds: [3])
        let three = store.workout(exercises: [(fly, Sets()), (fly, Sets()), (fly, Sets())])
        let (primary, secondary) = [three].musclesTrained()
        #expect(muscleNames(primary) == ["Chest", "Front Deltoid"])
        #expect(secondary.isEmpty)

        let two = store.workout(exercises: [(fly, Sets()), (fly, Sets())])
        let (primaryOfTwo, secondaryOfTwo) = [two].musclesTrained()
        #expect(muscleNames(primaryOfTwo) == ["Chest"])
        #expect(muscleNames(secondaryOfTwo) == ["Front Deltoid"])
    }

    // MARK: Recent days

    @Test func countsFinishedWorkoutsOfTodayAndTheTwoDaysBeforeAcrossWeekBorders() {
        // Monday, the workouts of the weekend before still count
        let now = date(2026, 10, 12, 8, 0)
        let calendar = testCalendar()
        #expect(store.workout(date: date(2026, 10, 10, 0, 0)).isRecent(now: now, calendar: calendar))
        #expect(store.workout(date: date(2026, 10, 11, 18, 0)).isRecent(now: now, calendar: calendar))
        #expect(!store.workout(date: date(2026, 10, 9, 23, 59)).isRecent(now: now, calendar: calendar))
        #expect(!store.workout(date: date(2026, 10, 12, 7, 0), inProgress: true).isRecent(now: now, calendar: calendar))
    }
}

@MainActor
struct ExerciseAndSchemeHelpersTests {

    let store: TestStore

    init() throws {
        store = try TestStore()
        store.insertReferenceData()
    }

    @Test func looksUpTheReferenceDataOfAnExercise() {
        let exercise = store.exercise("Bench", aliases: ["Flat Bench"], muscleGroupId: 1, equipmentId: 1, primaryMuscleIds: [3, 1], secondaryMuscleIds: [99])
        #expect(exercise.searchNames == ["Bench", "Flat Bench"])
        #expect(exercise.muscleGroup?.name == "Chest")
        #expect(exercise.equipment?.name == "Barbell")
        // in the order of the ids, unknown ones are left out
        #expect(exercise.primaryMuscles.map(\.name) == ["Front Deltoid", "Chest"])
        #expect(exercise.secondaryMuscles.isEmpty)
        #expect(!exercise.usesBodyweight)
        #expect(store.exercise("Push Up", equipmentId: 2).usesBodyweight)
        #expect(store.exercise("Pull Up", equipmentId: 3).usesBodyweight)
    }

    @Test func knowsWhatCanBeEdited() {
        let verified = store.exercise("Bench", verified: true)
        #expect(!verified.canEdit)
        #expect(!verified.canChangeTrackedMetrics)
        let custom = store.exercise("Mine", tracksReps: false, tracksDistance: true)
        #expect(custom.canEdit)
        #expect(custom.canChangeTrackedMetrics)
        #expect(custom.trackedMetrics == [.weights, .distance])
        store.workout(exercises: [(custom, Sets(weights: [1], distance: [1]))])
        #expect(!custom.canChangeTrackedMetrics)
    }

    @Test func replacesTheExercisesOfASchemeInPlace() throws {
        let a = store.exercise("A"), b = store.exercise("B"), c = store.exercise("C")
        let scheme = WorkoutScheme(name: "Pull")
        store.context.insert(scheme)
        scheme.syncState = .synced
        let first = WorkoutSchemeExercise(scheme: scheme, exercise: a, index: 0)
        let second = WorkoutSchemeExercise(scheme: scheme, exercise: b, index: 1)
        scheme.exercises = [first, second]
        try store.context.save()

        scheme.replaceExercises(with: [c], context: store.context)
        #expect(scheme.sortedExercises.map(\.name) == ["C"])
        #expect(scheme.exercises.first === first)
        #expect(second.isDeleted)
        #expect(scheme.syncState == .updated)

        scheme.replaceExercises(with: [c, a, b], context: store.context)
        #expect(scheme.sortedExercises.map(\.name) == ["C", "A", "B"])
    }
}

@MainActor
struct ChatHelpersTests {

    let store: TestStore
    let users: [Int: User]

    init() throws {
        store = try TestStore()
        let me = User(serverId: 1, username: "me", profileImageUrl: "", profileIconUrl: "")
        let friend = User(serverId: 2, username: "anna", profileImageUrl: "", profileIconUrl: "")
        friend.isFriend = true
        let blocked = User(serverId: 3, username: "troll", profileImageUrl: "", profileIconUrl: "")
        blocked.isBlocked = true
        let stranger = User(serverId: 4, username: "bob", profileImageUrl: "", profileIconUrl: "")
        [me, friend, blocked, stranger].forEach(store.context.insert)
        users = User.byServerId([me, friend, blocked, stranger, me])
    }

    func directChat(with userId: Int, createdAt: Date = .now) -> Chat {
        let chat = Chat(serverId: 100 + userId, groupChat: false, createdAt: createdAt)
        store.context.insert(chat)
        chat.members = [ChatMember(chat: chat, userId: 1, lastReadMessageId: 0), ChatMember(chat: chat, userId: userId, lastReadMessageId: 0)]
        return chat
    }

    @Test func namesTheChatAfterTheGroupOrTheOtherMember() {
        #expect(users.count == 4)
        #expect(directChat(with: 2).title(users: users, currentUserId: 1) == "anna")
        #expect(directChat(with: 99).title(users: users, currentUserId: 1) == "Unknown user")
        let group = Chat(serverId: 1, groupChat: true, name: "Gym", createdAt: .now)
        #expect(group.title(users: users, currentUserId: 1) == "Gym")
        #expect(Chat(serverId: 2, groupChat: true, createdAt: .now).title(users: users, currentUserId: 1) == "Group")
        #expect(group.otherMemberId(currentUserId: 1) == nil)
    }

    @Test func countsTheUnreadMessagesOfOthers() {
        let chat = directChat(with: 2)
        chat.members.first { $0.userId == 1 }?.lastReadMessageId = 11
        chat.messages = [
            Message(serverId: 10, chat: chat, senderId: 2, createdAt: .now),
            Message(serverId: 11, chat: chat, senderId: 2, createdAt: .now),
            Message(serverId: 12, chat: chat, senderId: 2, createdAt: .now),
            Message(serverId: 13, chat: chat, senderId: 1, createdAt: .now),
            Message(serverId: 14, chat: chat, senderId: nil, createdAt: .now),
        ]
        #expect(chat.unreadCount(currentUserId: 1) == 2)
        #expect(chat.unreadCount(currentUserId: nil) == 0)
        #expect(chat.unreadCount(currentUserId: 5) == 0)
        #expect(chat.sortedMessages.map(\.serverId) == [10, 11, 12, 13, 14])
    }

    @Test func blocksSendingToUsersThatArentFriends() {
        #expect(directChat(with: 2).sendingBlockedReason(users: users, currentUserId: 1) == nil)
        #expect(directChat(with: 3).sendingBlockedReason(users: users, currentUserId: 1) == "You blocked troll. Unblock them in the settings to send messages.")
        #expect(directChat(with: 4).sendingBlockedReason(users: users, currentUserId: 1) == "You can only send messages to friends.")
        #expect(directChat(with: 99).sendingBlockedReason(users: users, currentUserId: 1) == "You can only send messages to friends.")
        // before the first user sync nobody is known
        #expect(directChat(with: 99).sendingBlockedReason(users: [:], currentUserId: 1) == nil)
    }

    @Test func hidesDirectChatsWithBlockedUsers() {
        #expect(directChat(with: 3).isHidden(users: users, currentUserId: 1))
        #expect(!directChat(with: 2).isHidden(users: users, currentUserId: 1))
    }

    @Test func sortsByTheLatestMessage() {
        let chat = directChat(with: 2, createdAt: isoDate("2026-10-01T08:00:00Z"))
        #expect(chat.lastActivity == isoDate("2026-10-01T08:00:00Z"))
        chat.latestMessageTimestamp = isoDate("2026-10-02T08:00:00Z")
        #expect(chat.lastActivity == isoDate("2026-10-02T08:00:00Z"))
    }
}
