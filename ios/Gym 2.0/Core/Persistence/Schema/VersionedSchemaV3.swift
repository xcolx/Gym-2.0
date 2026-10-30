//
//  VersionedSchemaV3.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 05.10.2026.
//

import Foundation
import SwiftData

// Local copy of the backend. The server is the single source of truth and owns all ids (serverId).
//
// Models that can be changed offline carry an optional serverId (nil until pushed) and a syncState.
// Models that can be created offline also carry a clientUUID. It is no id, only a marker the server stores to recognize
// a create that was sent twice. When pulling, a row is matched by serverId first and by clientUUID second.
// References to server-only data (users, muscles, equipment, muscle groups) are stored as fix server ids,
// so a complete resync never breaks relationships.

enum VersionedSchemaV3: VersionedSchema {

    static var models: [any PersistentModel.Type] {
        [User.self, Muscle.self, MuscleGroup.self, Equipment.self, Exercise.self, Workout.self, WorkoutExercise.self, WorkoutScheme.self, WorkoutSchemeExercise.self, Chat.self, ChatMember.self, Message.self]
    }

    static var versionIdentifier: Schema.Version = .init(3, 0, 0)
}


extension VersionedSchemaV3 {

    // State of a local change that still has to be pushed to the server
    enum SyncState: Int, Codable {
        case synced     // matches the server
        case created    // only exists locally -> create
        case updated    // changed locally -> update
        case deleted    // deleted locally -> delete, hidden in the UI and removed locally after the server confirmed
    }

    // MARK: - Users

    // The current user, friends, blocked users and users in the same group chat.
    // Only created online, can be updated offline
    @Model
    final class User {
        @Attribute(.unique)
        var serverId: Int
        // users always exist on the server, so only .synced and .updated (settings of the current user changed offline) are used
        var syncState: SyncState = SyncState.synced

        var username: String
        var profileImageUrl: String
        var profileIconUrl: String

        // only for the current user and friends
        var language: String?

        // only for the current user
        var email: String?
        var createdAt: Date?
        // can be changed offline
        var bodyweight: Double?
        var schemeColor: String? // for every user, shown as the border around the profile image
        var weightUnit: Int?
        var distanceUnit: Int?

        var isCurrentUser: Bool = false
        var isFriend: Bool = false
        var isBlocked: Bool = false

        init(serverId: Int, username: String, profileImageUrl: String, profileIconUrl: String) {
            self.serverId = serverId
            self.username = username
            self.profileImageUrl = profileImageUrl
            self.profileIconUrl = profileIconUrl
        }
    }

    // MARK: - Reference data

    // not creatable or modifyable
    @Model
    final class Muscle {
        @Attribute(.unique)
        var serverId: Int

        var name: String
        var imageUrl: String

        init(serverId: Int, name: String, imageUrl: String) {
            self.serverId = serverId
            self.name = name
            self.imageUrl = imageUrl
        }
    }

    // not creatable or modifyable
    @Model
    final class MuscleGroup {
        @Attribute(.unique)
        var serverId: Int

        var name: String

        init(serverId: Int, name: String) {
            self.serverId = serverId
            self.name = name
        }
    }

    // not creatable or modifyable
    @Model
    final class Equipment {
        @Attribute(.unique)
        var serverId: Int

        var name: String

        init(serverId: Int, name: String) {
            self.serverId = serverId
            self.name = name
        }
    }

    // MARK: - Exercises

    // Verified exercises and the custom exercises of the current user
    // can be created and updated offline
    @Model
    final class Exercise {
        var serverId: Int?
        var syncState: SyncState = SyncState.created
        // sent when creating it, so that a create sent again after a lost response returns the existing object
        var clientUUID: UUID = UUID()

        var name: String
        // other names of the exercise, only used by the search and not shown
        var aliases: [String] = []
        var exerciseDescription: String?
        // hashes of the uploaded images, e.g. one per keyframe of the movement, shown in this order followed by the
        // pending images. Removing one of a custom exercise removes it on the server with the next sync.
        var imageUrls: [String] = []
        // images of a custom exercise that were added offline, uploaded together with the exercise. Scaled down
        // JPEGs (ExerciseImageUpload), so that they can be stored in the row.
        var pendingImages: [Data] = []

        var muscleGroupId: Int
        var equipmentId: Int
        var primaryMuscleIds: [Int]
        var secondaryMuscleIds: [Int]
        var verified: Bool

        // which values are tracked per set
        var tracksReps: Bool
        var tracksWeights: Bool
        var tracksTime: Bool
        var tracksIntensity: Bool
        var tracksDistance: Bool

        @Relationship(inverse: \WorkoutExercise.exercise)
        var workoutExercises: [WorkoutExercise] = []
        @Relationship(inverse: \WorkoutSchemeExercise.exercise)
        var schemeExercises: [WorkoutSchemeExercise] = []

        init(name: String, aliases: [String] = [], exerciseDescription: String? = nil, muscleGroupId: Int, equipmentId: Int, primaryMuscleIds: [Int] = [], secondaryMuscleIds: [Int] = [], verified: Bool = false, tracksReps: Bool = true, tracksWeights: Bool = true, tracksTime: Bool = false, tracksIntensity: Bool = false, tracksDistance: Bool = false) {
            self.name = name
            self.aliases = aliases
            self.exerciseDescription = exerciseDescription
            self.muscleGroupId = muscleGroupId
            self.equipmentId = equipmentId
            self.primaryMuscleIds = primaryMuscleIds
            self.secondaryMuscleIds = secondaryMuscleIds
            self.verified = verified
            self.tracksReps = tracksReps
            self.tracksWeights = tracksWeights
            self.tracksTime = tracksTime
            self.tracksIntensity = tracksIntensity
            self.tracksDistance = tracksDistance
        }
    }

    // MARK: - Workouts

    // can be created and updated offline
    @Model
    final class Workout {
        var serverId: Int?
        var syncState: SyncState = SyncState.created
        // sent when creating it, so that a create sent again after a lost response returns the existing object
        var clientUUID: UUID = UUID()

        var name: String
        var date: Date    
        var duration: Int // in minutes
        var inProgress: Bool

        @Relationship(deleteRule: .cascade, inverse: \WorkoutExercise.workout)
        var workoutExercises: [WorkoutExercise] = []

        init(name: String = "", date: Date = .now, duration: Int = 0, inProgress: Bool = true) {
            self.name = name
            self.date = date
            self.duration = duration
            self.inProgress = inProgress
        }
    }

    // can be created and updated offline
    @Model
    final class WorkoutExercise {
        var serverId: Int?
        var syncState: SyncState = SyncState.created
        // sent when creating it, so that a create sent again after a lost response returns the existing object
        var clientUUID: UUID = UUID()

        var workout: Workout?
        var exercise: Exercise?
        var unilateral: Bool
        var index: Int //to sort the WorkoutExercises inside a workout, SwiftData gives them in a random order

        // one value per "set", nil if the metric is not tracked by the exercise
        var reps: [Int]?
        var weights: [Double]?
        var time: [Int]?
        var intensity: [Double]?
        var distance: [Double]?

        init(workout: Workout, exercise: Exercise, unilateral: Bool = false, index: Int, reps: [Int]? = nil, weights: [Double]? = nil, time: [Int]? = nil, intensity: [Double]? = nil, distance: [Double]? = nil) {
            self.workout = workout
            self.exercise = exercise
            self.unilateral = unilateral
            self.index = index
            self.reps = reps
            self.weights = weights
            self.time = time
            self.intensity = intensity
            self.distance = distance
        }
    }

    // MARK: - Workout schemes

    // can be created and updated offline
    @Model
    final class WorkoutScheme {
        var serverId: Int?
        var syncState: SyncState = SyncState.created
        // sent when creating it, so that a create sent again after a lost response returns the existing object
        var clientUUID: UUID = UUID()

        var name: String
        var lastPerformed: Date?

        @Relationship(deleteRule: .cascade, inverse: \WorkoutSchemeExercise.scheme)
        var exercises: [WorkoutSchemeExercise] = []

        init(name: String = "") {
            self.name = name
        }
    }

    // can be created and updated offline
    @Model
    final class WorkoutSchemeExercise {
        var scheme: WorkoutScheme?
        var exercise: Exercise?
        var index: Int

        init(scheme: WorkoutScheme, exercise: Exercise, index: Int) {
            self.scheme = scheme
            self.exercise = exercise
            self.index = index
        }
    }

    // MARK: - Chats

    // only created and updated online
    @Model
    final class Chat {
        @Attribute(.unique)
        var serverId: Int

        var groupChat: Bool
        var name: String?
        var imageUrl: String?
        var createdAt: Date
        var createdById: Int?
        var isPublic: Bool

        // for the chat list, so it can be sorted without loading the messages
        var latestMessageTimestamp: Date?
        var latestMessagePreview: String?
        var latestMessageSenderId: Int?

        // local only: text in the input field, cleared when the server accepted the message
        var input: String = ""
        // sent with the message and kept for retries, cleared together with input when the server accepted the message
        var inputUUID: UUID?

        // replaced completely on every sync (read_states)
        @Relationship(deleteRule: .cascade, inverse: \ChatMember.chat)
        var members: [ChatMember] = []

        @Relationship(deleteRule: .cascade, inverse: \Message.chat)
        var messages: [Message] = []

        init(serverId: Int, groupChat: Bool, name: String? = nil, imageUrl: String? = nil, createdAt: Date, createdById: Int? = nil, isPublic: Bool = false) {
            self.serverId = serverId
            self.groupChat = groupChat
            self.name = name
            self.imageUrl = imageUrl
            self.createdAt = createdAt
            self.createdById = createdById
            self.isPublic = isPublic
        }
    }

    // only created and updated online
    @Model
    final class ChatMember {
        var chat: Chat?
        var userId: Int
        var lastReadMessageId: Int
        /// Whether the member is an admin of the group, nil for direct chats
        var admin: Bool?

        init(chat: Chat, userId: Int, lastReadMessageId: Int, admin: Bool? = nil) {
            self.chat = chat
            self.userId = userId
            self.lastReadMessageId = lastReadMessageId
            self.admin = admin
        }
    }

    // Only created and updated online, an unsent message stays in Chat.input
    @Model
    final class Message {
        @Attribute(.unique)
        var serverId: Int

        var chat: Chat?
        var senderId: Int?
        var createdAt: Date
        var content: String?
        var imageUrl: String?

        init(serverId: Int, chat: Chat, senderId: Int?, createdAt: Date, content: String? = nil, imageUrl: String? = nil) {
            self.serverId = serverId
            self.chat = chat
            self.senderId = senderId
            self.createdAt = createdAt
            self.content = content
            self.imageUrl = imageUrl
        }
    }
}
