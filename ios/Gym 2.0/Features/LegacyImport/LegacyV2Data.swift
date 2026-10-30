//
//  LegacyV2Data.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 05.10.2026.
//

import Foundation
import OSLog
import SwiftData

extension Logger {
    /// The V2 → V3 migration and the import of its data
    static let legacyImport = Logger(subsystem: Bundle.main.bundleIdentifier ?? "Gym 2.0", category: "LegacyImport")
}

// Workouts, schemes and exercises of the local-only V2 store. V3 references server ids that do not exist
// during the migration, so the data is written to a file and imported after the first login by matching
// exercises by name. Exercises are referenced by name, enums are stored as their raw values.
struct LegacyV2Data: Codable {

    struct Exercise: Codable {
        // set before the first upload and kept in the file, so that a retried import does not create duplicates
        var clientUUID: UUID?
        var name: String
        var exerciseDescription: String
        var image: Data?
        var muscleGroup: String
        var primaryMuscles: [String]
        var secondaryMuscles: [String]
        var equipment: String
        var verified: Bool
    }

    struct WorkoutExercise: Codable {
        var exerciseName: String
        var unilateral: Bool
        var index: Int
        var reps: [Int]
        var weights: [Double]
    }

    struct Workout: Codable {
        var clientUUID: UUID?
        var name: String
        var date: Date
        var duration: Int // in minutes
        var inProgress: Bool
        var exercises: [WorkoutExercise]
    }

    struct SchemeExercise: Codable {
        var exerciseName: String
        var index: Int
    }

    struct Scheme: Codable {
        var clientUUID: UUID?
        var name: String
        var creationDate: Date
        var exercises: [SchemeExercise]
    }

    // custom exercises and all exercises used by a workout or scheme
    var exercises: [Exercise]
    var workouts: [Workout]
    var schemes: [Scheme]

    var isEmpty: Bool {
        exercises.isEmpty && workouts.isEmpty && schemes.isEmpty
    }

    static let fileURL = URL.applicationSupportDirectory.appending(path: "LegacyV2Data.json")

    static func read() throws -> LegacyV2Data? {
        guard FileManager.default.fileExists(atPath: fileURL.path(percentEncoded: false)) else { return nil }
        return try JSONDecoder().decode(LegacyV2Data.self, from: Data(contentsOf: fileURL))
    }

    func write() throws {
        try FileManager.default.createDirectory(at: Self.fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        try JSONEncoder().encode(self).write(to: Self.fileURL, options: .atomic)
    }

    static var exists: Bool {
        FileManager.default.fileExists(atPath: fileURL.path(percentEncoded: false))
    }

    /// Called once the data is on the server or the user decided not to import it.
    static func delete() throws {
        guard exists else { return }
        try FileManager.default.removeItem(at: fileURL)
    }

    /// Gives every exercise, workout and scheme a client UUID. Returns whether one was missing.
    mutating func assignClientUUIDs() -> Bool {
        var changed = false
        for index in exercises.indices where exercises[index].clientUUID == nil {
            exercises[index].clientUUID = UUID()
            changed = true
        }
        for index in workouts.indices where workouts[index].clientUUID == nil {
            workouts[index].clientUUID = UUID()
            changed = true
        }
        for index in schemes.indices where schemes[index].clientUUID == nil {
            schemes[index].clientUUID = UUID()
            changed = true
        }
        return changed
    }
}

extension LegacyV2Data {

    init(context: ModelContext) throws {
        let workouts = try context.fetch(FetchDescriptor<VersionedSchemaV2.Workout>())
        let schemes = try context.fetch(FetchDescriptor<VersionedSchemaV2.WorkoutScheme>())

        let usedNames = Set(workouts.flatMap { $0.workoutExercises.map(\.exercise.name) } + schemes.flatMap { $0.exercises.map(\.exercise.name) })
        let exercises = try context.fetch(FetchDescriptor<VersionedSchemaV2.Exercise>())
            .filter { !$0.verified || usedNames.contains($0.name) }

        self.exercises = exercises.map { exercise in
            Exercise(
                name: exercise.name,
                exerciseDescription: exercise.exerciseDescription,
                image: exercise.image,
                muscleGroup: exercise.muscleGroup.rawValue,
                primaryMuscles: exercise.primaryMuscles.map(\.rawValue),
                secondaryMuscles: exercise.secondaryMuscles.map(\.rawValue),
                equipment: exercise.equipment.rawValue,
                verified: exercise.verified
            )
        }

        self.workouts = workouts.map { workout in
            Workout(
                name: workout.name,
                date: workout.date,
                duration: workout.time,
                inProgress: workout.inProgress,
                exercises: workout.workoutExercises.map { workoutExercise in
                    WorkoutExercise(
                        exerciseName: workoutExercise.exercise.name,
                        unilateral: workoutExercise.unilateral,
                        index: workoutExercise.index,
                        reps: workoutExercise.reps,
                        weights: workoutExercise.weight
                    )
                }
            )
        }

        self.schemes = schemes.map { scheme in
            Scheme(
                name: scheme.name,
                creationDate: scheme.creationDate,
                exercises: scheme.exercises.map { SchemeExercise(exerciseName: $0.exercise.name, index: $0.index) }
            )
        }
    }
}
