//
//  LegacyImportPlanTests.swift
//  Gym 2.0Tests
//
//  Created by Colin Rüegg on 21.10.2026.
//
//  The upload of the local-only V2 data (LegacyV2Data) after the update to V3
//

import Foundation
import Testing
@testable import Gym_2_0

struct LegacyImportPlanTests {

    static let png = Data([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0])

    let muscleGroups = [MuscleGroupDTO(id: 3, name: "Arms"), MuscleGroupDTO(id: 8, name: "Core")]
    let equipment = [EquipmentDTO(id: 4, name: "Dumbbell"), EquipmentDTO(id: 9, name: "Body")]
    let muscles = [MuscleDTO(id: 5, name: "Biceps", imageUrl: ""), MuscleDTO(id: 6, name: "Forearms", imageUrl: "")]

    func legacyExercise(_ name: String, verified: Bool, clientUUID: UUID? = nil, description: String = "", image: Data? = nil, muscleGroup: String = "Arms", equipment: String = "Dumbbell", primaryMuscles: [String] = [], secondaryMuscles: [String] = []) -> LegacyV2Data.Exercise {
        LegacyV2Data.Exercise(clientUUID: clientUUID, name: name, exerciseDescription: description, image: image, muscleGroup: muscleGroup, primaryMuscles: primaryMuscles, secondaryMuscles: secondaryMuscles, equipment: equipment, verified: verified)
    }

    func plan(_ data: LegacyV2Data, server: [ExerciseDTO]) -> Result<LegacyImportPlan, UnmatchedLegacyData> {
        LegacyImportPlan.make(from: data, serverExercises: server, muscleGroups: muscleGroups, equipment: equipment, muscles: muscles)
    }

    @Test func matchesVerifiedExercisesByNameAndCreatesTheCustomOnes() throws {
        let curlUUID = UUID()
        let data = LegacyV2Data(
            exercises: [
                legacyExercise("Bench Press", verified: true),
                legacyExercise("My Curl", verified: false, clientUUID: curlUUID, description: "  Slow  ", image: Self.png, primaryMuscles: ["biceps"], secondaryMuscles: ["Forearms"]),
            ],
            workouts: [
                LegacyV2Data.Workout(name: "  ", date: isoDate("2025-03-01T10:00:00Z"), duration: 2000, inProgress: true, exercises: [
                    LegacyV2Data.WorkoutExercise(exerciseName: "My Curl", unilateral: true, index: 5, reps: [10, 8, 6], weights: [12.34, 12.36]),
                    LegacyV2Data.WorkoutExercise(exerciseName: "Bénch press ", unilateral: false, index: 2, reps: [5], weights: [100]),
                ]),
            ],
            schemes: [
                LegacyV2Data.Scheme(name: "Push Day", creationDate: .now, exercises: [
                    LegacyV2Data.SchemeExercise(exerciseName: "Bench Press", index: 1),
                    LegacyV2Data.SchemeExercise(exerciseName: "My Curl", index: 0),
                ]),
            ]
        )
        // A custom exercise of the server with the same name isn't matched
        let server = [exerciseDTO(id: 2, name: "My Curl", verified: false), exerciseDTO(id: 1, name: "Bench Press")]

        let plan = try plan(data, server: server).get()
        #expect(plan.requestCount == 3)

        let custom = try #require(plan.customExercises.first)
        #expect(plan.customExercises.count == 1)
        #expect(custom.legacyName == "My Curl")
        #expect(custom.draft.clientUuid == curlUUID)
        #expect(custom.draft.name == "My Curl")
        #expect(custom.draft.description == "Slow")
        #expect(custom.draft.muscleGroupId == 3)
        #expect(custom.draft.equipmentId == 4)
        #expect(custom.draft.primaryMuscleIds == [5])
        #expect(custom.draft.secondaryMuscleIds == [6])
        #expect(custom.draft.reps && custom.draft.weights)
        #expect(custom.image?.mimeType == "image/png")

        let workout = try #require(plan.workouts.first)
        #expect(workout.workout.name == "Workout")
        #expect(workout.workout.duration == 1440)
        #expect(!workout.workout.inProgress)
        #expect(workout.references == [.server(id: 1), .custom(legacyName: "My Curl")])
        let resolved = workout.resolved(["My Curl": 99])
        #expect(resolved.exercises.map(\.exerciseId) == [1, 99])
        #expect(resolved.exercises.map(\.index) == [0, 1])
        #expect(resolved.exercises[0].reps == [5])
        // only complete sets, weights with one decimal
        #expect(resolved.exercises[1].reps == [10, 8])
        #expect(resolved.exercises[1].weights == [12.3, 12.4])
        #expect(resolved.exercises[1].unilateral)

        let scheme = try #require(plan.schemes.first)
        #expect(scheme.scheme.name == "Push Day")
        #expect(scheme.references == [.custom(legacyName: "My Curl"), .server(id: 1)])
        #expect(scheme.resolved(["My Curl": 99]).exercises == [
            WorkoutSchemeExerciseDraft(exerciseId: 99, index: 0),
            WorkoutSchemeExerciseDraft(exerciseId: 1, index: 1),
        ])
    }

    @Test func aCustomExerciseWinsOverAVerifiedOneWithTheSameName() throws {
        let data = LegacyV2Data(
            exercises: [legacyExercise("Curl", verified: true), legacyExercise("Curl", verified: false, clientUUID: UUID())],
            workouts: [LegacyV2Data.Workout(name: "Arms", date: .now, duration: 30, inProgress: false, exercises: [
                LegacyV2Data.WorkoutExercise(exerciseName: "Curl", unilateral: false, index: 0, reps: [10], weights: [10]),
            ])],
            schemes: []
        )
        let plan = try plan(data, server: [exerciseDTO(id: 1, name: "Curl")]).get()
        #expect(plan.customExercises.count == 1)
        #expect(plan.workouts.first?.references == [.custom(legacyName: "Curl")])
    }

    @Test func listsEveryReasonWhyTheDataDoesntFitTheServer() throws {
        let data = LegacyV2Data(
            exercises: [legacyExercise("Old", verified: false, clientUUID: UUID(), muscleGroup: "Gone", primaryMuscles: ["Nope"])],
            workouts: [
                LegacyV2Data.Workout(name: "Core", date: .now, duration: 30, inProgress: false, exercises: [
                    LegacyV2Data.WorkoutExercise(exerciseName: "Deleted Exercise", unilateral: false, index: 0, reps: [1], weights: [1]),
                    LegacyV2Data.WorkoutExercise(exerciseName: "Bench Press", unilateral: false, index: 1, reps: [10], weights: [10_000]),
                    // Weights the exercise doesn't track anymore are left out, so their range doesn't matter
                    LegacyV2Data.WorkoutExercise(exerciseName: "Push Up", unilateral: false, index: 2, reps: [10], weights: [10_000]),
                ]),
            ],
            schemes: [LegacyV2Data.Scheme(name: "Old", creationDate: .now, exercises: [LegacyV2Data.SchemeExercise(exerciseName: "Deleted Exercise", index: 0)])]
        )
        let server = [
            exerciseDTO(id: 2, name: "Push Up", weights: false),
            exerciseDTO(id: 3, name: "Bench Press"),
        ]
        let result = plan(data, server: server)
        guard case .failure(let unmatched) = result else {
            Issue.record("Expected the plan to fail")
            return
        }
        let issues = unmatched.issues
        #expect(issues.contains("The muscle group “Gone” of your exercise “Old” doesn't exist anymore."))
        #expect(issues.contains("The muscle “Nope” of your exercise “Old” doesn't exist anymore."))
        // Reported once, although the workout and the scheme use it
        #expect(issues.filter { $0 == "The exercise “Deleted Exercise” doesn't exist anymore." }.count == 1)
        #expect(issues.contains { $0.hasPrefix("“Bench Press” in the workout “Core”") && $0.hasSuffix("has weights the server doesn't accept.") })
        #expect(issues.count == 4)
    }

    @Test func fillsNewMetricsWithZeroAndLeavesOutTheOnesNotTrackedAnymore() throws {
        let data = LegacyV2Data(
            exercises: [],
            workouts: [LegacyV2Data.Workout(name: "Push", date: .now, duration: 30, inProgress: false, exercises: [
                LegacyV2Data.WorkoutExercise(exerciseName: "Pushdown", unilateral: false, index: 0, reps: [12, 10], weights: [0, 0]),
                LegacyV2Data.WorkoutExercise(exerciseName: "Plank", unilateral: false, index: 1, reps: [3], weights: [20]),
            ])],
            schemes: []
        )
        let server = [
            exerciseDTO(id: 1, name: "Pushdown", weights: false, intensity: true),
            exerciseDTO(id: 2, name: "Plank", reps: false, weights: false, time: true, distance: true),
        ]
        let workout = try #require(try plan(data, server: server).get().workouts.first)
        let exercises = workout.resolved([:]).exercises

        #expect(exercises[0].reps == [12, 10])
        #expect(exercises[0].weights == nil)
        #expect(exercises[0].intensity == [0, 0])
        #expect(exercises[0].time == nil && exercises[0].distance == nil)

        #expect(exercises[1].reps == nil && exercises[1].weights == nil && exercises[1].intensity == nil)
        #expect(exercises[1].time == [0])
        #expect(exercises[1].distance == [0])
    }

    @Test func emptyDataNeedsNoRequests() throws {
        let data = LegacyV2Data(exercises: [], workouts: [], schemes: [])
        #expect(data.isEmpty)
        #expect(try plan(data, server: []).get().requestCount == 0)
    }

    @Test func assignsMissingClientUUIDsOnce() {
        var data = LegacyV2Data(
            exercises: [legacyExercise("Curl", verified: false)],
            workouts: [LegacyV2Data.Workout(name: "Arms", date: .now, duration: 30, inProgress: false, exercises: [])],
            schemes: [LegacyV2Data.Scheme(name: "Arms", creationDate: .now, exercises: [])]
        )
        let assigned = data.assignClientUUIDs()
        #expect(assigned)
        #expect(data.exercises[0].clientUUID != nil && data.workouts[0].clientUUID != nil && data.schemes[0].clientUUID != nil)
        let uuids = (data.exercises[0].clientUUID, data.workouts[0].clientUUID)
        let assignedAgain = data.assignClientUUIDs()
        #expect(!assignedAgain)
        #expect(data.exercises[0].clientUUID == uuids.0 && data.workouts[0].clientUUID == uuids.1)
    }
}

struct ImageUploadTests {

    @Test func detectsTheFormatsTheServerAccepts() {
        #expect(ImageUpload(detecting: Data([0xFF, 0xD8, 0xFF, 0xE0]))?.mimeType == "image/jpeg")
        #expect(ImageUpload(detecting: LegacyImportPlanTests.png)?.filename == "image.png")
        #expect(ImageUpload(detecting: Data("RIFF\0\0\0\0WEBPVP8 ".utf8))?.mimeType == "image/webp")
        #expect(ImageUpload(detecting: Data("\0\0\0\u{18}ftypheic".utf8))?.mimeType == "image/heic")
    }

    @Test func refusesOtherData() {
        #expect(ImageUpload(detecting: Data("GIF89a".utf8)) == nil)
        #expect(ImageUpload(detecting: Data()) == nil)
        #expect(ImageUpload(detecting: Data("RIFF".utf8)) == nil)
    }
}
