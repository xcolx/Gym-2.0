//
//  DTO+Mapping.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 04.10.2026.
//

import Foundation

// Converts between the DTOs and the SwiftData models.
// Requests are built from the local state, responses overwrite it (the server is the single source of truth).

/// Server limits, see backend/app/schemas/workouts.py and workout_schemes.py
private enum Limits {
    static let name = 25
    static let duration = 0...1440
}

/// The server rejects empty names and names longer than 25 characters
private func serverName(_ name: String, fallback: String) -> String {
    let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
    return String((trimmed.isEmpty ? fallback : trimmed).prefix(Limits.name))
}

// MARK: - Reference data

extension Muscle {
    func apply(_ dto: MuscleDTO) {
        name = dto.name
        imageUrl = dto.imageUrl
    }
}

extension MuscleGroup {
    func apply(_ dto: MuscleGroupDTO) {
        name = dto.name
    }
}

extension Equipment {
    func apply(_ dto: EquipmentDTO) {
        name = dto.name
    }
}

// MARK: - Exercises

extension Exercise {

    convenience init(_ dto: ExerciseDTO) {
        self.init(name: dto.name, muscleGroupId: dto.muscleGroupId, equipmentId: dto.equipmentId)
        apply(dto)
    }

    /// The fields for creating or updating it. The client UUID is only used by a create.
    var draft: ExerciseDraft {
        ExerciseDraft(
            clientUuid: clientUUID,
            name: name,
            aliases: aliases,
            description: exerciseDescription,
            imageUrls: imageUrls,
            muscleGroupId: muscleGroupId,
            equipmentId: equipmentId,
            primaryMuscleIds: primaryMuscleIds,
            secondaryMuscleIds: secondaryMuscleIds,
            reps: tracksReps,
            weights: tracksWeights,
            time: tracksTime,
            intensity: tracksIntensity,
            distance: tracksDistance
        )
    }

    func apply(_ dto: ExerciseDTO) {
        serverId = dto.id
        if let clientUuid = dto.clientUuid {
            clientUUID = clientUuid
        }
        syncState = .synced
        name = dto.name
        aliases = dto.aliases
        exerciseDescription = dto.description
        imageUrls = dto.imageUrls
        muscleGroupId = dto.muscleGroupId
        equipmentId = dto.equipmentId
        primaryMuscleIds = dto.primaryMuscleIds
        secondaryMuscleIds = dto.secondaryMuscleIds
        verified = dto.verified
        tracksReps = dto.reps
        tracksWeights = dto.weights
        tracksTime = dto.time
        tracksIntensity = dto.intensity
        tracksDistance = dto.distance
    }
}

// MARK: - Workouts

extension Workout {

    /// Nil while an exercise of the workout has no server id yet.
    var newWorkoutRequest: NewWorkout? {
        var drafts: [WorkoutExerciseDraft] = []
        for (index, workoutExercise) in sortedWorkoutExercises.enumerated() {
            guard var draft = workoutExercise.draft(index: index) else { return nil }
            draft.clientUuid = workoutExercise.clientUUID
            drafts.append(draft)
        }
        return NewWorkout(
            clientUuid: clientUUID,
            name: serverName(name, fallback: "Workout"),
            date: date,
            duration: Limits.duration.clamped(duration),
            inProgress: inProgress,
            exercises: drafts
        )
    }

    var updateRequest: WorkoutUpdate {
        WorkoutUpdate(name: serverName(name, fallback: "Workout"), date: date, duration: Limits.duration.clamped(duration), inProgress: inProgress)
    }

    var sortedWorkoutExercises: [WorkoutExercise] {
        workoutExercises.sorted { $0.index < $1.index }
    }

    /// Overwrites the workout and replaces its exercises with the ones of the server.
    /// `exercises` are the local exercises by server id. Returns false if one of them is missing.
    @discardableResult
    func apply(_ dto: WorkoutDTO, exercises: [Int: Exercise]) -> Bool {
        serverId = dto.id
        if let clientUuid = dto.clientUuid {
            clientUUID = clientUuid
        }
        syncState = .synced
        name = dto.name
        date = dto.date
        duration = dto.duration
        inProgress = dto.inProgress

        var complete = true
        var remaining = workoutExercises
        var updated: [WorkoutExercise] = []
        for exerciseDTO in dto.exercises {
            guard let exercise = exercises[exerciseDTO.exerciseId] else {
                complete = false
                continue
            }
            // Matched by server id first and by client UUID second, like the workout itself
            let match = remaining.firstIndex { $0.serverId == exerciseDTO.id }
                ?? remaining.firstIndex { $0.serverId == nil && $0.clientUUID == exerciseDTO.clientUuid }
            let workoutExercise: WorkoutExercise
            if let match {
                workoutExercise = remaining.remove(at: match)
            } else {
                workoutExercise = WorkoutExercise(workout: self, exercise: exercise, index: exerciseDTO.index)
            }
            workoutExercise.apply(exerciseDTO, exercise: exercise)
            updated.append(workoutExercise)
        }
        remaining.forEach { $0.modelContext?.delete($0) }
        workoutExercises = updated
        return complete
    }
}

extension WorkoutExercise {

    /// Nil while the exercise has no server id yet.
    func draft(index: Int) -> WorkoutExerciseDraft? {
        guard let exerciseId = exercise?.serverId else { return nil }
        return WorkoutExerciseDraft(
            exerciseId: exerciseId,
            unilateral: unilateral,
            index: index,
            reps: reps,
            weights: weights,
            time: time,
            intensity: intensity,
            distance: distance
        )
    }

    /// Replaces all fields, the metrics the exercise doesn't track are left out. Nil while the exercise has no server id yet.
    func updateRequest(index: Int) -> WorkoutExerciseUpdate? {
        guard let exerciseId = exercise?.serverId else { return nil }
        return WorkoutExerciseUpdate(
            exerciseId: exerciseId,
            unilateral: unilateral,
            index: index,
            reps: reps,
            weights: weights,
            time: time,
            intensity: intensity,
            distance: distance
        )
    }

    func apply(_ dto: WorkoutExerciseDTO, exercise: Exercise) {
        serverId = dto.id
        if let clientUuid = dto.clientUuid {
            clientUUID = clientUuid
        }
        syncState = .synced
        self.exercise = exercise
        unilateral = dto.unilateral
        index = dto.index
        // Like on the server, a metric the exercise doesn't track is nil
        reps = exercise.tracksReps ? dto.reps ?? [] : nil
        weights = exercise.tracksWeights ? dto.weights ?? [] : nil
        time = exercise.tracksTime ? dto.time ?? [] : nil
        intensity = exercise.tracksIntensity ? dto.intensity ?? [] : nil
        distance = exercise.tracksDistance ? dto.distance ?? [] : nil
    }
}

// MARK: - Workout schemes

extension WorkoutScheme {

    /// Nil while an exercise of the scheme has no server id yet.
    var newSchemeRequest: NewWorkoutScheme? {
        guard let drafts = exerciseDrafts else { return nil }
        return NewWorkoutScheme(clientUuid: clientUUID, name: serverName(name, fallback: "Workout"), exercises: drafts)
    }

    /// Replaces the name and the complete exercise list. Nil while an exercise has no server id yet.
    var updateRequest: WorkoutSchemeUpdate? {
        guard let drafts = exerciseDrafts else { return nil }
        return WorkoutSchemeUpdate(name: serverName(name, fallback: "Workout"), exercises: drafts)
    }

    private var exerciseDrafts: [WorkoutSchemeExerciseDraft]? {
        var drafts: [WorkoutSchemeExerciseDraft] = []
        for (index, exercise) in sortedExercises.enumerated() {
            guard let exerciseId = exercise.serverId else { return nil }
            drafts.append(WorkoutSchemeExerciseDraft(exerciseId: exerciseId, index: index))
        }
        return drafts
    }

    /// Overwrites the scheme and replaces its exercises with the ones of the server.
    /// `exercises` are the local exercises by server id. Returns false if one of them is missing.
    @discardableResult
    func apply(_ dto: WorkoutSchemeDTO, exercises: [Int: Exercise]) -> Bool {
        serverId = dto.id
        if let clientUuid = dto.clientUuid {
            clientUUID = clientUuid
        }
        syncState = .synced
        name = dto.name
        lastPerformed = dto.lastPerformed

        // The existing rows are updated in place. Deleting them and creating new ones for the same exercises
        // lost the exercise of the new rows.
        let matched = dto.exercises.sorted { $0.index < $1.index }.compactMap { exercises[$0.exerciseId] }
        var rows = self.exercises.sorted { $0.index < $1.index }
        while rows.count > matched.count {
            let row = rows.removeLast()
            row.modelContext?.delete(row)
        }
        for (index, exercise) in matched.enumerated() {
            if index < rows.count {
                rows[index].exercise = exercise
                rows[index].index = index
            } else {
                rows.append(WorkoutSchemeExercise(scheme: self, exercise: exercise, index: index))
            }
        }
        self.exercises = rows
        return matched.count == dto.exercises.count
    }
}

// MARK: - Users

extension User {

    convenience init(_ dto: UserDTO) {
        self.init(serverId: dto.id, username: dto.username, profileImageUrl: dto.profileImageUrl, profileIconUrl: dto.profileIconUrl)
        apply(dto)
    }

    /// The settings that can be changed offline. Only the current user has them.
    var profileUpdate: ProfileUpdate {
        ProfileUpdate(
            bodyweight: bodyweight,
            schemeColor: schemeColor,
            weightUnit: weightUnit.flatMap(UnitSystem.init(rawValue:)),
            distanceUnit: distanceUnit.flatMap(UnitSystem.init(rawValue:))
        )
    }

    /// `includingSettings` is false while the current user has settings that weren't pushed yet
    func apply(_ dto: UserDTO, includingSettings: Bool = true) {
        username = dto.username
        profileImageUrl = dto.profileImageUrl
        profileIconUrl = dto.profileIconUrl
        language = dto.language
        email = dto.email
        createdAt = dto.createdAt
        guard includingSettings else { return }
        syncState = .synced
        bodyweight = dto.bodyweight
        schemeColor = dto.schemeColor
        weightUnit = dto.weightUnit?.rawValue
        distanceUnit = dto.distanceUnit?.rawValue
    }
}

// MARK: - Chats

extension Chat {

    convenience init(_ dto: ChatDTO) {
        self.init(serverId: dto.id, groupChat: dto.isGroupChat, createdAt: dto.createdAt)
        apply(dto)
    }

    /// The metadata, the members and the messages are synced separately
    func apply(_ dto: ChatDTO) {
        // Only changed values are set, an unchanged chat isn't marked as changed by every poll
        if groupChat != dto.isGroupChat { groupChat = dto.isGroupChat }
        if name != dto.name { name = dto.name }
        if imageUrl != dto.imageUrl { imageUrl = dto.imageUrl }
        if createdAt != dto.createdAt { createdAt = dto.createdAt }
        if createdById != dto.createdBy { createdById = dto.createdBy }
        if isPublic != dto.isPublic { isPublic = dto.isPublic }
        if latestMessageTimestamp != dto.latestMessageTimestamp { latestMessageTimestamp = dto.latestMessageTimestamp }
        if latestMessagePreview != dto.latestMessagePreview { latestMessagePreview = dto.latestMessagePreview }
        if latestMessageSenderId != dto.latestMessageSenderId { latestMessageSenderId = dto.latestMessageSenderId }
    }

    /// Replaces the members and their read state. Only what changed is touched: the chats are polled every few
    /// seconds, and every change re-renders the views that show the chat.
    func replaceMembers(with dtos: [ChatMemberDTO]) {
        let existing = Dictionary(members.map { ($0.userId, $0) }, uniquingKeysWith: { first, _ in first })
        let newIds = Set(dtos.map(\.userId))
        for member in members where !newIds.contains(member.userId) {
            member.modelContext?.delete(member)
        }
        var added: [ChatMember] = []
        for dto in dtos {
            if let member = existing[dto.userId] {
                if member.lastReadMessageId != dto.lastReadMessageId {
                    member.lastReadMessageId = dto.lastReadMessageId
                }
                if member.admin != dto.admin {
                    member.admin = dto.admin
                }
            } else {
                added.append(ChatMember(chat: self, userId: dto.userId, lastReadMessageId: dto.lastReadMessageId, admin: dto.admin))
            }
        }
        if newIds == Set(existing.keys) && existing.count == members.count {
            return
        }
        members = members.filter { newIds.contains($0.userId) && !$0.isDeleted } + added
    }
}

extension Message {
    convenience init(_ dto: MessageDTO, chat: Chat) {
        self.init(serverId: dto.id, chat: chat, senderId: dto.senderId, createdAt: dto.createdAt, content: dto.content, imageUrl: dto.imageUrl)
    }
}

private extension ClosedRange where Bound == Int {
    func clamped(_ value: Int) -> Int {
        Swift.min(Swift.max(value, lowerBound), upperBound)
    }
}
