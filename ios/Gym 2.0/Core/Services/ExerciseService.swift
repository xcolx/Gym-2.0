//
//  ExerciseService.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 04.10.2026.
//

import Foundation

/// Exercises, equipment and muscles against /exercises.
///
/// The list contains the verified exercises and the ones the current user created. Only the creator can
/// update or delete an unverified exercise. It can only be deleted while it isn't part of a workout or a workout scheme,
/// and its tracked metrics only changed while it isn't part of a workout (409 otherwise).
final class ExerciseService {
    private let api: APIClient

    init(api: APIClient) {
        self.api = api
    }

    /// All exercises, for the first sync. Use `changes(since:)` with the returned sync time afterwards.
    func all() async throws -> ExerciseListDTO {
        try await api.send(.allExercises)
    }

    /// The exercises created, updated or deleted since the sync time of the previous `all()` or `changes(since:)`.
    func changes(since syncTime: String) async throws -> ExerciseDeltaDTO {
        try await api.send(.exerciseChanges(since: syncTime))
    }

    /// At most `Exercise.maxImages` images, shown in this order.
    func create(_ draft: ExerciseDraft, images: [ImageUpload] = []) async throws -> ExerciseDTO {
        try await api.send(.createExercise(draft, images: images))
    }

    /// Replaces all fields of the exercise. The images become the uploaded ones listed in `draft.imageUrls` followed
    /// by the new `images`.
    func update(id: Int, with draft: ExerciseDraft, images: [ImageUpload] = []) async throws -> ExerciseDTO {
        try await api.send(.updateExercise(id: id, draft, images: images))
    }

    func delete(id: Int) async throws {
        try await api.send(.deleteExercise(id: id))
    }

    func equipment() async throws -> [EquipmentDTO] {
        try await api.send(.equipment)
    }

    func muscleGroups() async throws -> [MuscleGroupDTO] {
        try await api.send(.muscleGroups)
    }

    func muscles() async throws -> [MuscleDTO] {
        try await api.send(.muscles)
    }
}

private extension Endpoint {
    static let allExercises = Endpoint(method: .get, path: "/exercises")
    static let equipment = Endpoint(method: .get, path: "/exercises/equipment")
    static let muscleGroups = Endpoint(method: .get, path: "/exercises/muscle-groups")
    static let muscles = Endpoint(method: .get, path: "/exercises/muscles")

    static func exerciseChanges(since syncTime: String) -> Endpoint {
        Endpoint(method: .get, path: "/exercises/delta", queryItems: [URLQueryItem(name: "last_sync_time", value: syncTime)])
    }

    static func createExercise(_ draft: ExerciseDraft, images: [ImageUpload]) -> Endpoint {
        Endpoint(method: .post, path: "/exercises", body: .multipart(form(for: draft, images: images, isUpdate: false)))
    }

    static func updateExercise(id: Int, _ draft: ExerciseDraft, images: [ImageUpload]) -> Endpoint {
        Endpoint(method: .put, path: "/exercises/\(id)", body: .multipart(form(for: draft, images: images, isUpdate: true)))
    }

    static func deleteExercise(id: Int) -> Endpoint {
        Endpoint(method: .delete, path: "/exercises/\(id)")
    }

    private static func form(for draft: ExerciseDraft, images: [ImageUpload], isUpdate: Bool) -> MultipartFormData {
        var form = MultipartFormData()
        if let clientUuid = draft.clientUuid {
            form.append(clientUuid.uuidString, name: "client_uuid")
        }
        form.append(draft.name, name: "name")
        form.append(draft.aliases, name: "aliases")
        if let description = draft.description {
            form.append(description, name: "description")
        }
        if isUpdate {
            form.append(draft.imageUrls, name: "image_urls")
        }
        form.append(draft.muscleGroupId, name: "muscle_group_id")
        form.append(draft.equipmentId, name: "equipment_id")
        form.append(draft.primaryMuscleIds, name: "primary_muscle_ids")
        form.append(draft.secondaryMuscleIds, name: "secondary_muscle_ids")
        form.append(draft.reps, name: "reps")
        form.append(draft.weights, name: "weights")
        form.append(draft.time, name: "time")
        form.append(draft.intensity, name: "intensity")
        form.append(draft.distance, name: "distance")
        // repeated file fields, shown in this order
        for image in images {
            form.appendFile(image.data, name: "images", filename: image.filename, mimeType: image.mimeType)
        }
        return form
    }
}
