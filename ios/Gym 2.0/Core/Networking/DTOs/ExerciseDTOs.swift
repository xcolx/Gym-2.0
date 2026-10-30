//
//  ExerciseDTOs.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 04.10.2026.
//

import Foundation

// Mirrors backend/app/schemas/exercises.py

struct ExerciseDTO: Decodable, Identifiable, Equatable {
    let id: Int
    /// The UUID sent when creating it, only for objects of the current user. Used to match a create whose response was lost.
    let clientUuid: UUID?
    let name: String
    /// Other names of the exercise, only used by the search and not shown.
    let aliases: [String]
    let description: String?
    /// Image hashes in the order they are shown, served by GET /images/{hash}.
    let imageUrls: [String]
    let muscleGroupId: Int
    let equipmentId: Int
    let verified: Bool

    // Tracked metrics
    let reps: Bool
    let weights: Bool
    let time: Bool
    let intensity: Bool
    let distance: Bool

    let primaryMuscleIds: [Int]
    let secondaryMuscleIds: [Int]
}

/// The fields for creating or updating an exercise. Sent as multipart/form-data together with the new images.
struct ExerciseDraft: Equatable {
    /// Only used when creating. If an exercise with this UUID already exists, it is returned instead of creating it again.
    var clientUuid: UUID?
    var name: String
    /// At most 20 with at most 50 characters each. Duplicates and the name itself are ignored by the server.
    var aliases: [String] = []
    var description: String?
    /// Only used when updating: the uploaded images to keep, in their order. The new images follow them, the other
    /// uploaded images are removed.
    var imageUrls: [String] = []
    var muscleGroupId: Int
    var equipmentId: Int
    var primaryMuscleIds: [Int] = []
    var secondaryMuscleIds: [Int] = []

    // Tracked metrics, at least one has to be true
    var reps: Bool
    var weights: Bool
    var time: Bool = false
    var intensity: Bool = false
    var distance: Bool = false
}

/// A JPEG, PNG, WebP or HEIC image to upload.
struct ImageUpload {
    let data: Data
    var filename: String = "image.jpg"
    var mimeType: String = "image/jpeg"
}

extension ImageUpload {
    /// Detects the format from the first bytes, e.g. for an image stored as picked. Nil for formats the server doesn't accept.
    init?(detecting data: Data) {
        let bytes = [UInt8](data.prefix(12))
        func matches(_ signature: [UInt8], at offset: Int = 0) -> Bool {
            bytes.count >= offset + signature.count && Array(bytes[offset..<offset + signature.count]) == signature
        }

        if matches([0xFF, 0xD8, 0xFF]) {
            self.init(data: data, filename: "image.jpg", mimeType: "image/jpeg")
        } else if matches([0x89, 0x50, 0x4E, 0x47]) {
            self.init(data: data, filename: "image.png", mimeType: "image/png")
        } else if matches(Array("RIFF".utf8)) && matches(Array("WEBP".utf8), at: 8) {
            self.init(data: data, filename: "image.webp", mimeType: "image/webp")
        } else if matches(Array("ftyp".utf8), at: 4) {
            self.init(data: data, filename: "image.heic", mimeType: "image/heic")
        } else {
            return nil
        }
    }
}

struct ExerciseListDTO: Decodable {
    let exercises: [ExerciseDTO]
    /// Pass to `ExerciseService.changes(since:)` for the next sync. Kept as the server sent it to not lose precision.
    let syncTime: String
}

struct ExerciseDeltaDTO: Decodable {
    let updates: [ExerciseChangeDTO]
    let syncTime: String
}

/// One changed exercise. The backend sends the exercise fields and the action in the same object.
/// Created and updated should both be treated as an upsert, and deletions of unknown IDs ignored,
/// because a change can be delivered more than once.
struct ExerciseChangeDTO: Decodable {
    enum Action: Int, Decodable {
        case created = 0
        case updated = 1
        case deleted = 2
    }

    let action: Action
    let exercise: ExerciseDTO

    private enum CodingKeys: String, CodingKey {
        case action
    }

    init(from decoder: Decoder) throws {
        action = try decoder.container(keyedBy: CodingKeys.self).decode(Action.self, forKey: .action)
        exercise = try ExerciseDTO(from: decoder)
    }
}

struct EquipmentDTO: Decodable, Identifiable, Equatable {
    let id: Int
    let name: String
}

struct MuscleGroupDTO: Decodable, Identifiable, Equatable {
    let id: Int
    let name: String
}

struct MuscleDTO: Decodable, Identifiable, Equatable {
    let id: Int
    let name: String
    /// Image hash, served by GET /images/{hash}.
    let imageUrl: String
}
