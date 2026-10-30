//
//  DTODecodingTests.swift
//  Gym 2.0Tests
//
//  Created by Colin Rüegg on 21.10.2026.
//
//  The JSON of the backend decoded with the decoder of APIClient (snake_case keys, ISO 8601 dates)
//

import Foundation
import Testing
@testable import Gym_2_0

@MainActor
struct DTODecodingTests {

    nonisolated func decode<T: Decodable>(_ type: T.Type, _ json: String) async throws -> T {
        try await StubURLProtocol.client { _ in .json(json) }.send(Endpoint(method: .get, path: "/dto"), as: T.self)
    }

    static let exerciseJSON = """
        "id": 7, "client_uuid": "aaaaaaaa-0000-4000-8000-000000000000", "name": "Squat", "aliases": ["Back Squat"],
        "description": null, "image_urls": ["hash-1", "hash-2"], "muscle_group_id": 2, "equipment_id": 1, "verified": true,
        "reps": true, "weights": true, "time": false, "intensity": false, "distance": false,
        "primary_muscle_ids": [4], "secondary_muscle_ids": []
        """

    @Test func decodesExercises() async throws {
        let list = try await decode(ExerciseListDTO.self, #"{"exercises": [{\#(Self.exerciseJSON)}], "sync_time": "2026-10-15T08:30:00.123456+00:00"}"#)
        #expect(list.syncTime == "2026-10-15T08:30:00.123456+00:00")
        let exercise = try #require(list.exercises.first)
        #expect(exercise == exerciseDTO(
            id: 7,
            clientUuid: UUID(uuidString: "AAAAAAAA-0000-4000-8000-000000000000"),
            name: "Squat",
            aliases: ["Back Squat"],
            imageUrls: ["hash-1", "hash-2"],
            muscleGroupId: 2,
            equipmentId: 1,
            primaryMuscleIds: [4]
        ))
    }

    @Test func decodesExerciseChangesWithTheActionNextToTheFields() async throws {
        let delta = try await decode(ExerciseDeltaDTO.self, #"{"updates": [{"action": 2, \#(Self.exerciseJSON)}, {"action": 0, \#(Self.exerciseJSON)}], "sync_time": "t"}"#)
        #expect(delta.updates.map(\.action) == [.deleted, .created])
        #expect(delta.updates[0].exercise.name == "Squat")
    }

    static let workoutJSON = """
        "id": 50, "client_uuid": null, "name": "Legs", "date": "2026-10-15T08:00:00+00:00", "duration": 30, "in_progress": false,
        "exercises": [
            {"id": 100, "client_uuid": "C1C1C1C1-0000-4000-8000-000000000000", "exercise_id": 7, "unilateral": true, "index": 0,
             "reps": [5, 5], "weights": [100, 100.5], "time": null, "intensity": null, "distance": null}
        ]
        """

    @Test func decodesWorkouts() async throws {
        let list = try await decode(WorkoutListDTO.self, #"{"workouts": [{\#(Self.workoutJSON)}], "sync_time": "t"}"#)
        let workout = try #require(list.workouts.first)
        #expect(workout.id == 50)
        #expect(workout.clientUuid == nil)
        #expect(workout.date == isoDate("2026-10-15T08:00:00Z"))
        #expect(!workout.inProgress)
        #expect(workout.exercises == [workoutExerciseDTO(
            id: 100,
            clientUuid: UUID(uuidString: "C1C1C1C1-0000-4000-8000-000000000000"),
            exerciseId: 7,
            unilateral: true,
            index: 0,
            reps: [5, 5],
            weights: [100, 100.5]
        )])
    }

    @Test func decodesWorkoutChangesDeletionsOnlyWithTheirId() async throws {
        let delta = try await decode(WorkoutDeltaDTO.self, #"{"updates": [{"id": 9, "action": 2}, {"action": 1, \#(Self.workoutJSON)}], "sync_time": "t"}"#)
        #expect(delta.updates[0].id == 9)
        #expect(delta.updates[0].action == .deleted)
        #expect(delta.updates[0].workout == nil)
        #expect(delta.updates[1].action == .updated)
        #expect(delta.updates[1].workout?.name == "Legs")
    }

    @Test func decodesWorkoutSchemesAndTheirChanges() async throws {
        let scheme = #""id": 3, "client_uuid": null, "name": "Pull", "last_performed": null, "exercises": [{"id": 30, "exercise_id": 2, "index": 0}]"#
        let delta = try await decode(WorkoutSchemeDeltaDTO.self, #"{"updates": [{"id": 4, "action": 2}, {"action": 0, \#(scheme)}], "sync_time": "t"}"#)
        #expect(delta.updates[0].scheme == nil)
        let dto = try #require(delta.updates[1].scheme)
        #expect(dto.lastPerformed == nil)
        #expect(dto.exercises == [WorkoutSchemeExerciseDTO(id: 30, exerciseId: 2, index: 0)])
    }

    @Test func decodesUsersWithTheirUnits() async throws {
        let full = try await decode(UserDTO.self, """
            {"id": 1, "username": "colin", "email": "c@example.com", "profile_image_url": "", "profile_icon_url": "",
             "bodyweight": 80, "scheme_color": "#00FF00", "weight_unit": 1, "distance_unit": 0, "language": "en",
             "created_at": "2024-07-28T10:00:00+00:00"}
            """)
        #expect(full == userDTO())
        // Other users come without the private fields
        let other = try await decode(UserDTO.self, #"{"id": 2, "username": "anna", "profile_image_url": "a", "profile_icon_url": "b", "scheme_color": null}"#)
        #expect(other.email == nil)
        #expect(other.weightUnit == nil)
        #expect(other.createdAt == nil)
    }

    @Test func decodesChatsWithTheirRenamedKeys() async throws {
        let list = try await decode(ChatListDTO.self, """
            {"chats": [
                {"id": 4, "group_chat": true, "name": "Gym", "image_url": null, "created_at": "2026-10-01T08:00:00+00:00",
                 "created_by": 1, "public": true, "latest_message_timestamp": "2026-10-02T08:00:00.5+00:00",
                 "latest_message_preview": "Hi", "latest_message_sender_id": 1,
                 "members": [{"user_id": 1, "last_read_message_id": 10, "admin": true}],
                 "messages": [{"id": 10, "chat_id": 4, "sender_id": null, "created_at": "2026-10-02T08:00:00+00:00", "content": "Hi", "image_url": null}]},
                {"id": 5, "group_chat": false, "created_at": "2026-10-01T08:00:00+00:00", "public": false, "members": []}
            ], "sync_time": "t"}
            """)
        let group = list.chats[0]
        #expect(group.isGroupChat)
        #expect(group.isPublic)
        #expect(group.createdBy == 1)
        #expect(group.members == [ChatMemberDTO(userId: 1, lastReadMessageId: 10, admin: true)])
        #expect(group.messages.first?.senderId == nil)
        #expect(group.messages.first?.deletedAt == nil)
        #expect(group.latestMessageTimestamp == isoDate("2026-10-02T08:00:00Z").addingTimeInterval(0.5))
        // Missing optional keys and messages
        let direct = list.chats[1]
        #expect(!direct.isGroupChat)
        #expect(direct.name == nil)
        #expect(direct.createdBy == nil)
        #expect(direct.messages.isEmpty)
    }

    @Test func decodesChatDeltasWithDeletedMessagesAndReadStates() async throws {
        let delta = try await decode(ChatDeltaDTO.self, """
            {"chats": [], "read_states": [{"chat_id": 4, "members": [{"user_id": 2, "last_read_message_id": 0}]}], "sync_time": "t"}
            """)
        #expect(delta.readStates == [ChatReadStateDTO(chatId: 4, members: [ChatMemberDTO(userId: 2, lastReadMessageId: 0, admin: nil)])])
        let message = try await decode(MessageDTO.self, #"{"id": 11, "chat_id": 4, "sender_id": 1, "created_at": "2026-10-02T08:00:00Z", "content": null, "image_url": null, "deleted_at": "2026-10-03T08:00:00Z"}"#)
        #expect(message.deletedAt == isoDate("2026-10-03T08:00:00Z"))
    }

    @Test func decodesTheReferenceData() async throws {
        let muscles = try await decode([MuscleDTO].self, #"[{"id": 1, "name": "Chest", "image_url": "hash"}]"#)
        #expect(muscles == [MuscleDTO(id: 1, name: "Chest", imageUrl: "hash")])
        let equipment = try await decode([EquipmentDTO].self, #"[{"id": 1, "name": "Barbell"}]"#)
        #expect(equipment == [EquipmentDTO(id: 1, name: "Barbell")])
    }
}
