//
//  DTOFactory.swift
//  Gym 2.0Tests
//
//  Created by Colin Rüegg on 21.10.2026.
//
//  DTOs with defaults, so that a test only names what it is about
//

import Foundation
@testable import Gym_2_0

func exerciseDTO(
    id: Int,
    clientUuid: UUID? = nil,
    name: String,
    aliases: [String] = [],
    description: String? = nil,
    imageUrls: [String] = [],
    muscleGroupId: Int = 1,
    equipmentId: Int = 1,
    verified: Bool = true,
    reps: Bool = true,
    weights: Bool = true,
    time: Bool = false,
    intensity: Bool = false,
    distance: Bool = false,
    primaryMuscleIds: [Int] = [],
    secondaryMuscleIds: [Int] = []
) -> ExerciseDTO {
    ExerciseDTO(
        id: id,
        clientUuid: clientUuid,
        name: name,
        aliases: aliases,
        description: description,
        imageUrls: imageUrls,
        muscleGroupId: muscleGroupId,
        equipmentId: equipmentId,
        verified: verified,
        reps: reps,
        weights: weights,
        time: time,
        intensity: intensity,
        distance: distance,
        primaryMuscleIds: primaryMuscleIds,
        secondaryMuscleIds: secondaryMuscleIds
    )
}

func workoutExerciseDTO(
    id: Int,
    clientUuid: UUID? = nil,
    exerciseId: Int,
    unilateral: Bool = false,
    index: Int,
    reps: [Int]? = nil,
    weights: [Double]? = nil,
    time: [Int]? = nil,
    intensity: [Double]? = nil,
    distance: [Double]? = nil
) -> WorkoutExerciseDTO {
    WorkoutExerciseDTO(id: id, clientUuid: clientUuid, exerciseId: exerciseId, unilateral: unilateral, index: index, reps: reps, weights: weights, time: time, intensity: intensity, distance: distance)
}

func userDTO(
    id: Int = 1,
    username: String = "colin",
    email: String? = "c@example.com",
    bodyweight: Double? = 80,
    schemeColor: String? = "#00FF00",
    weightUnit: UnitSystem? = .imperial,
    distanceUnit: UnitSystem? = .metric,
    language: String? = "en",
    createdAt: Date? = isoDate("2024-07-28T10:00:00Z")
) -> UserDTO {
    UserDTO(id: id, username: username, email: email, profileImageUrl: "", profileIconUrl: "", bodyweight: bodyweight, schemeColor: schemeColor, weightUnit: weightUnit, distanceUnit: distanceUnit, language: language, createdAt: createdAt)
}
