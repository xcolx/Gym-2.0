//
//  DTOMappingTests.swift
//  Gym 2.0Tests
//
//  Created by Colin Rüegg on 21.10.2026.
//
//  Converting between the DTOs and the SwiftData models. Mirrors web/src/lib/api/mapping.test.ts
//

import Foundation
import SwiftData
import Testing
@testable import Gym_2_0

@MainActor
struct DTOMappingTests {

    let store: TestStore

    init() throws {
        store = try TestStore()
    }

    // MARK: Exercises

    @Test func createsASyncedExerciseFromTheServer() {
        let uuid = UUID()
        let exercise = Exercise(exerciseDTO(id: 7, clientUuid: uuid, name: "Squat", aliases: ["Back Squat"], description: "Deep", imageUrls: ["hash-1", "hash-2"], muscleGroupId: 2, equipmentId: 3, primaryMuscleIds: [4], secondaryMuscleIds: [5]))
        #expect(exercise.serverId == 7)
        #expect(exercise.syncState == .synced)
        #expect(exercise.clientUUID == uuid)
        #expect(exercise.name == "Squat")
        #expect(exercise.aliases == ["Back Squat"])
        #expect(exercise.exerciseDescription == "Deep")
        #expect(exercise.imageUrls == ["hash-1", "hash-2"])
        #expect(exercise.muscleGroupId == 2)
        #expect(exercise.equipmentId == 3)
        #expect(exercise.primaryMuscleIds == [4])
        #expect(exercise.secondaryMuscleIds == [5])
        #expect(exercise.tracksReps && exercise.tracksWeights && !exercise.tracksTime)
        #expect(exercise.verified)
    }

    @Test func keepsTheClientUUIDAndPendingImagesOfAnExistingExercise() {
        let existing = store.exercise("Curl", syncState: .updated)
        existing.pendingImages = [Data([1])]
        let uuid = existing.clientUUID
        existing.apply(exerciseDTO(id: 7, clientUuid: nil, name: "Squat"))
        #expect(existing.clientUUID == uuid)
        #expect(existing.pendingImages == [Data([1])])
        #expect(existing.syncState == .synced)
        #expect(existing.name == "Squat")
    }

    @Test func buildsTheDraftForTheServer() {
        let exercise = store.exercise("Curl", aliases: ["Biceps Curl"], tracksReps: true, tracksWeights: false, tracksTime: true)
        exercise.exerciseDescription = "Slow"
        exercise.imageUrls = ["a"]
        let draft = exercise.draft
        #expect(draft.clientUuid == exercise.clientUUID)
        #expect(draft.name == "Curl")
        #expect(draft.aliases == ["Biceps Curl"])
        #expect(draft.description == "Slow")
        #expect(draft.imageUrls == ["a"])
        #expect(draft.reps && !draft.weights && draft.time && !draft.intensity && !draft.distance)
    }

    @Test func updatesTheReferenceData() {
        let muscle = Muscle(serverId: 1, name: "Old", imageUrl: "")
        muscle.apply(MuscleDTO(id: 1, name: "Chest", imageUrl: "hash"))
        #expect(muscle.name == "Chest" && muscle.imageUrl == "hash")
        let group = MuscleGroup(serverId: 1, name: "Old")
        group.apply(MuscleGroupDTO(id: 1, name: "Legs"))
        #expect(group.name == "Legs")
        let equipment = Equipment(serverId: 1, name: "Old")
        equipment.apply(EquipmentDTO(id: 1, name: "Barbell"))
        #expect(equipment.name == "Barbell")
    }

    // MARK: Workouts

    @Test func buildsTheCreateRequestWithConsecutiveIndexesAndClientUUIDs() throws {
        let squat = store.exercise("Squat", serverId: 7)
        let workout = store.workout("  ", date: isoDate("2026-10-15T08:00:00Z"), duration: 2000, syncState: .created, exercises: [
            (squat, Sets(reps: [3], weights: [80])),
            (squat, Sets(reps: [5], weights: [100])),
        ])
        let first = workout.sortedWorkoutExercises[0]
        let second = workout.sortedWorkoutExercises[1]
        first.index = 2
        second.index = 5

        let request = try #require(workout.newWorkoutRequest)
        #expect(request.clientUuid == workout.clientUUID)
        #expect(request.name == "Workout")
        #expect(request.duration == 1440)
        #expect(request.date == isoDate("2026-10-15T08:00:00Z"))
        #expect(request.exercises.map(\.clientUuid) == [first.clientUUID, second.clientUUID])
        #expect(request.exercises.map(\.exerciseId) == [7, 7])
        #expect(request.exercises.map(\.index) == [0, 1])
        #expect(request.exercises.map(\.reps) == [[3], [5]])
    }

    @Test func makesNamesTheServerAccepts() throws {
        let trimmed = store.workout("  Push  ")
        #expect(trimmed.updateRequest.name == "Push")
        let long = store.workout(String(repeating: "x", count: 30))
        #expect(long.updateRequest.name?.count == 25)
        let scheme = WorkoutScheme(name: "\n")
        store.context.insert(scheme)
        #expect(scheme.newSchemeRequest?.name == "Workout")
    }

    @Test func cantBuildRequestsWhileAnExerciseHasNoServerId() {
        let local = store.exercise("Local", serverId: nil, syncState: .created)
        let workout = store.workout(exercises: [(local, Sets(reps: [1]))])
        #expect(workout.newWorkoutRequest == nil)
        #expect(workout.workoutExercises[0].draft(index: 0) == nil)
        #expect(workout.workoutExercises[0].updateRequest(index: 0) == nil)
    }

    @Test func buildsTheUpdateRequestOfTheWorkoutItself() {
        let workout = store.workout("  ", date: isoDate("2026-10-15T08:00:00Z"), duration: -5, inProgress: true)
        #expect(workout.updateRequest == WorkoutUpdate(name: "Workout", date: isoDate("2026-10-15T08:00:00Z"), duration: 0, inProgress: true))
    }

    @Test func buildsTheUpdateRequestOfAWorkoutExercise() throws {
        let squat = store.exercise("Squat", serverId: 7)
        let workout = store.workout(exercises: [(squat, Sets(reps: [5], weights: [100], unilateral: true))])
        let update = try #require(workout.workoutExercises[0].updateRequest(index: 3))
        #expect(update == WorkoutExerciseUpdate(exerciseId: 7, unilateral: true, index: 3, reps: [5], weights: [100]))
    }

    @Test func appliesTheServersWorkoutAndMatchesItsExercises() throws {
        let squat = store.exercise("Squat", serverId: 7)
        let run = store.exercise("Run", serverId: 9, tracksReps: false, tracksWeights: false, tracksDistance: true)
        let workout = store.workout("Old", syncState: .created, exercises: [
            (squat, Sets(reps: [1], weights: [1])),
            (run, Sets(distance: [1])),
            (squat, Sets(reps: [1], weights: [1])),
        ])
        let pushed = workout.sortedWorkoutExercises[0]
        pushed.serverId = 100
        // created, but the response got lost
        let lostResponse = workout.sortedWorkoutExercises[1]
        let removedOnServer = workout.sortedWorkoutExercises[2]
        removedOnServer.serverId = 101
        try store.context.save()

        let dto = WorkoutDTO(
            id: 50,
            clientUuid: workout.clientUUID,
            name: "Legs",
            date: isoDate("2026-10-15T08:00:00Z"),
            duration: 30,
            inProgress: false,
            exercises: [
                workoutExerciseDTO(id: 100, exerciseId: 7, index: 0, reps: [5], weights: [100]),
                // the server sends a metric the exercise doesn't track as null, a tracked one always as array
                workoutExerciseDTO(id: 102, clientUuid: lostResponse.clientUUID, exerciseId: 9, index: 1),
                workoutExerciseDTO(id: 103, exerciseId: 999, index: 2, reps: [1], weights: [1]),
            ]
        )
        let complete = workout.apply(dto, exercises: [7: squat, 9: run])

        #expect(!complete)
        #expect(workout.serverId == 50)
        #expect(workout.syncState == .synced)
        #expect(workout.name == "Legs")
        #expect(workout.duration == 30)
        #expect(!workout.inProgress)
        let exercises = workout.sortedWorkoutExercises
        #expect(exercises.map(\.persistentModelID) == [pushed.persistentModelID, lostResponse.persistentModelID])
        #expect(exercises.map(\.serverId) == [100, 102])
        #expect(exercises.map(\.index) == [0, 1])
        #expect(exercises.allSatisfy { $0.syncState == .synced })
        #expect(pushed.reps == [5])
        #expect(lostResponse.reps == nil)
        #expect(lostResponse.weights == nil)
        #expect(lostResponse.distance == [])
        #expect(removedOnServer.isDeleted)
    }

    @Test func createsTheExercisesOfANewWorkoutFromTheServer() {
        let squat = store.exercise("Squat", serverId: 7)
        let workout = store.workout()
        let dto = WorkoutDTO(id: 1, clientUuid: nil, name: "Legs", date: .now, duration: 10, inProgress: true, exercises: [
            workoutExerciseDTO(id: 10, exerciseId: 7, unilateral: true, index: 0, reps: [1, 2], weights: [3, 4]),
        ])
        #expect(workout.apply(dto, exercises: [7: squat]))
        #expect(workout.workoutExercises.count == 1)
        #expect(workout.workoutExercises.first?.exercise === squat)
        #expect(workout.workoutExercises.first?.unilateral == true)
        #expect(workout.workoutExercises.first?.weights == [3, 4])
        #expect(workout.inProgress)
    }

    // MARK: Workout schemes

    @Test func buildsTheSchemeRequestsInTheOrderOfTheRows() throws {
        let a = store.exercise("A", serverId: 1)
        let b = store.exercise("B", serverId: 2)
        let scheme = WorkoutScheme(name: "Pull")
        store.context.insert(scheme)
        scheme.exercises = [
            WorkoutSchemeExercise(scheme: scheme, exercise: b, index: 1),
            WorkoutSchemeExercise(scheme: scheme, exercise: a, index: 0),
        ]
        let request = try #require(scheme.newSchemeRequest)
        #expect(request.clientUuid == scheme.clientUUID)
        #expect(request.name == "Pull")
        #expect(request.exercises == [WorkoutSchemeExerciseDraft(exerciseId: 1, index: 0), WorkoutSchemeExerciseDraft(exerciseId: 2, index: 1)])
        #expect(scheme.updateRequest == WorkoutSchemeUpdate(name: "Pull", exercises: request.exercises))

        let local = store.exercise("Local", syncState: .created)
        scheme.exercises.append(WorkoutSchemeExercise(scheme: scheme, exercise: local, index: 2))
        #expect(scheme.newSchemeRequest == nil)
        #expect(scheme.updateRequest == nil)
    }

    @Test func updatesTheExistingRowsInPlaceAndDeletesExtraOnes() throws {
        let a = store.exercise("A", serverId: 1)
        let b = store.exercise("B", serverId: 2)
        let scheme = WorkoutScheme(name: "Pull")
        store.context.insert(scheme)
        let first = WorkoutSchemeExercise(scheme: scheme, exercise: a, index: 0)
        let second = WorkoutSchemeExercise(scheme: scheme, exercise: b, index: 1)
        scheme.exercises = [first, second]
        try store.context.save()
        let uuid = scheme.clientUUID

        let dto = WorkoutSchemeDTO(id: 3, clientUuid: nil, name: "Pull", lastPerformed: isoDate("2026-10-15T08:00:00Z"), exercises: [
            WorkoutSchemeExerciseDTO(id: 30, exerciseId: 2, index: 0),
        ])
        #expect(scheme.apply(dto, exercises: [1: a, 2: b]))
        #expect(scheme.serverId == 3)
        #expect(scheme.syncState == .synced)
        #expect(scheme.clientUUID == uuid)
        #expect(scheme.lastPerformed == isoDate("2026-10-15T08:00:00Z"))
        #expect(scheme.exercises.count == 1)
        #expect(scheme.exercises.first === first)
        #expect(first.exercise === b)
        #expect(second.isDeleted)
        #expect(scheme.sortedExercises.map(\.name) == ["B"])
    }

    @Test func reportsSchemesWithUnknownExercises() {
        let scheme = WorkoutScheme(name: "Pull")
        store.context.insert(scheme)
        let dto = WorkoutSchemeDTO(id: 3, clientUuid: nil, name: "Pull", lastPerformed: nil, exercises: [WorkoutSchemeExerciseDTO(id: 30, exerciseId: 2, index: 0)])
        #expect(!scheme.apply(dto, exercises: [:]))
        #expect(scheme.exercises.isEmpty)
    }

    // MARK: Users and chats

    @Test func keepsSettingsThatWerentPushedYet() {
        let user = User(userDTO())
        store.context.insert(user)
        user.isCurrentUser = true
        user.bodyweight = 75
        user.syncState = .updated

        user.apply(userDTO(username: "new"), includingSettings: false)
        #expect(user.username == "new")
        #expect(user.bodyweight == 75)
        #expect(user.syncState == .updated)
        #expect(user.isCurrentUser)

        user.apply(userDTO())
        #expect(user.bodyweight == 80)
        #expect(user.syncState == .synced)
        #expect(user.weightUnit == UnitSystem.imperial.rawValue)
        #expect(user.profileUpdate == ProfileUpdate(bodyweight: 80, schemeColor: "#00FF00", weightUnit: .imperial, distanceUnit: .metric))
    }

    func chatDTO(name: String? = "Gym", isPublic: Bool = true) -> ChatDTO {
        // ChatDTO only has a decoder initializer
        let json = """
            {"id": 4, "groupChat": true, "name": \(name.map { "\"\($0)\"" } ?? "null"), "createdAt": "2026-10-01T08:00:00Z",
             "createdBy": 1, "public": \(isPublic), "members": []}
            """
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try! decoder.decode(ChatDTO.self, from: Data(json.utf8))
    }

    @Test func keepsTheLocalInputOfAChat() {
        let chat = Chat(serverId: 4, groupChat: true, createdAt: .now)
        store.context.insert(chat)
        chat.input = "Hi"
        let inputUUID = UUID()
        chat.inputUUID = inputUUID

        chat.apply(chatDTO())
        #expect(chat.groupChat)
        #expect(chat.isPublic)
        #expect(chat.name == "Gym")
        #expect(chat.createdById == 1)
        #expect(chat.createdAt == isoDate("2026-10-01T08:00:00Z"))
        #expect(chat.input == "Hi")
        #expect(chat.inputUUID == inputUUID)
        #expect(Chat(chatDTO(name: nil)).name == nil)
    }

    @Test func replacesTheMembersAndOnlyTouchesWhatChanged() throws {
        let chat = Chat(serverId: 4, groupChat: true, createdAt: .now)
        store.context.insert(chat)
        let kept = ChatMember(chat: chat, userId: 1, lastReadMessageId: 10, admin: false)
        let removed = ChatMember(chat: chat, userId: 2, lastReadMessageId: 5, admin: true)
        chat.members = [kept, removed]
        try store.context.save()

        chat.replaceMembers(with: [ChatMemberDTO(userId: 1, lastReadMessageId: 12, admin: true), ChatMemberDTO(userId: 3, lastReadMessageId: 0, admin: false)])
        #expect(Set(chat.members.map(\.userId)) == [1, 3])
        #expect(chat.members.first { $0.userId == 1 } === kept)
        #expect(kept.lastReadMessageId == 12)
        #expect(kept.admin == true)
        #expect(chat.members.first { $0.userId == 3 }?.admin == false)
        #expect(removed.isDeleted)

        // the same members again change nothing
        try store.context.save()
        chat.replaceMembers(with: [ChatMemberDTO(userId: 1, lastReadMessageId: 12, admin: true), ChatMemberDTO(userId: 3, lastReadMessageId: 0, admin: false)])
        #expect(!store.context.hasChanges)
    }

    @Test func createsMessagesFromTheServer() {
        let chat = Chat(serverId: 4, groupChat: false, createdAt: .now)
        store.context.insert(chat)
        let message = Message(MessageDTO(id: 11, chatId: 4, senderId: 2, createdAt: isoDate("2026-10-02T08:00:00Z"), content: "Hi", imageUrl: "img"), chat: chat)
        #expect(message.serverId == 11)
        #expect(message.chat === chat)
        #expect(message.senderId == 2)
        #expect(message.content == "Hi")
        #expect(message.imageUrl == "img")
    }
}
