//
//  MigrationTests.swift
//  Gym 2.0Tests
//
//  Created by Colin Rüegg on 21.10.2026.
//
//  Core/Persistence/Schema: stores of earlier versions are migrated to the current schema. V2 data can't be converted
//  (V3 references server ids), so the V2 → V3 migration writes it to LegacyV2Data.json and empties the store.
//

import Foundation
import SwiftData
import Testing
@testable import Gym_2_0

@MainActor
struct SchemaTests {

    @Test func opensAnInMemoryStoreWithTheCurrentSchema() throws {
        let store = try TestStore()
        store.insertReferenceData()
        let exercise = store.exercise("Squat", serverId: 1)
        store.workout(exercises: [(exercise, Sets(reps: [5], weights: [100]))])
        try store.context.save()
        #expect(try store.context.fetchAll(Workout.self).first?.workoutExercises.first?.exercise?.name == "Squat")
    }

    @Test func theMigrationPlanEndsWithTheCurrentSchema() {
        #expect(MyMigrationPlan.schemas.last.map(ObjectIdentifier.init) == ObjectIdentifier(CurrentVersionOfSchema.self))
        #expect(MyMigrationPlan.schemas.count == MyMigrationPlan.stages.count + 1)
        #expect(CurrentVersionOfSchema.versionIdentifier == Schema.Version(3, 0, 0))
        #expect(CurrentVersionOfSchema.models.count == 12)
    }
}

extension GlobalStateTests {

    @MainActor
    @Suite struct MigrationTests {

        let globalState = GlobalStateSnapshot()
        let directory = URL.temporaryDirectory.appending(path: "MigrationTests-\(UUID().uuidString)", directoryHint: .isDirectory)
        var storeURL: URL { directory.appending(path: "test.store") }

        init() throws {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        }

        /// Opens the store like CustomContainer does, with the current schema and the migration plan
        func openCurrent() throws -> ModelContainer {
            let schema = Schema(versionedSchema: CurrentVersionOfSchema.self)
            return try ModelContainer(for: schema, migrationPlan: MyMigrationPlan.self, configurations: ModelConfiguration(schema: schema, url: storeURL))
        }

        func create<Version: VersionedSchema>(_ version: Version.Type, fill: (ModelContext) throws -> Void) throws {
            let schema = Schema(versionedSchema: version)
            let container = try ModelContainer(for: schema, configurations: ModelConfiguration(schema: schema, url: storeURL))
            let context = ModelContext(container)
            try fill(context)
            try context.save()
        }

        func cleanUp() {
            try? FileManager.default.removeItem(at: directory)
        }

        @Test func createsANewStoreWithTheCurrentSchema() throws {
            defer { cleanUp() }
            do {
                let container = try openCurrent()
                container.mainContext.insert(Workout(name: "Legs"))
                try container.mainContext.save()
            }
            let reopened = try openCurrent()
            #expect(try reopened.mainContext.fetchAll(Workout.self).map(\.name) == ["Legs"])
            #expect(!LegacyV2Data.exists)
        }

        @Test func migratesAV2StoreToV3AndKeepsItsDataForTheImport() throws {
            defer { cleanUp() }
            let workoutDate = isoDate("2025-03-01T10:00:00Z")
            try create(VersionedSchemaV2.self) { context in
                let bench = VersionedSchemaV2.Exercise(name: "Bench Press", muscleGroup: .chest, primaryMuscles: [.chest], secondaryMuscles: [.triceps], equipment: .barbell, verified: true)
                let unused = VersionedSchemaV2.Exercise(name: "Unused", verified: true)
                let curl = VersionedSchemaV2.Exercise(name: "My Curl", exerciseDescription: "Slow", muscleGroup: .arms, primaryMuscles: [.biceps], equipment: .dumbbell, verified: false)
                curl.image = Data([0xFF, 0xD8, 0xFF])
                [bench, unused, curl].forEach(context.insert)

                let workout = VersionedSchemaV2.Workout(name: "Push", date: workoutDate, time: 75, inProgress: false)
                context.insert(workout)
                let workoutExercise = VersionedSchemaV2.WorkoutExercise(exercise: bench, unilateral: true, reps: [10, 8], weight: [60, 62.5], workout: workout, index: 0)
                context.insert(workoutExercise)
                workout.workoutExercises = [workoutExercise]

                let row = VersionedSchemaV2.ExerciseWithIndex(exercise: curl, index: 0)
                context.insert(row)
                let scheme = VersionedSchemaV2.WorkoutScheme(name: "Arms", exercises: [row])
                context.insert(scheme)

                let friend = VersionedSchemaV2.Friend(uid: "1", username: "anna")
                context.insert(friend)
                let chat = VersionedSchemaV2.Chat(friend: friend)
                context.insert(chat)
                context.insert(VersionedSchemaV2.Message(content: "Hi", sender: "anna", chat: chat))
            }

            let container = try openCurrent()
            let context = container.mainContext
            // The store is empty, everything is loaded from the server
            #expect(try context.fetchAll(Workout.self).isEmpty)
            #expect(try context.fetchAll(Exercise.self).isEmpty)
            #expect(try context.fetchAll(WorkoutScheme.self).isEmpty)
            #expect(try context.fetchAll(Chat.self).isEmpty)

            let legacy = try #require(try LegacyV2Data.read())
            #expect(Set(legacy.exercises.map(\.name)) == ["Bench Press", "My Curl"])
            let curl = try #require(legacy.exercises.first { $0.name == "My Curl" })
            #expect(!curl.verified)
            #expect(curl.exerciseDescription == "Slow")
            #expect(curl.image == Data([0xFF, 0xD8, 0xFF]))
            #expect(curl.muscleGroup == "Arms")
            #expect(curl.primaryMuscles == ["Biceps"])
            #expect(curl.equipment == "Dumbbell")

            let workout = try #require(legacy.workouts.first)
            #expect(legacy.workouts.count == 1)
            #expect(workout.name == "Push")
            #expect(workout.date == workoutDate)
            #expect(workout.duration == 75)
            #expect(workout.exercises.count == 1)
            #expect(workout.exercises.first?.exerciseName == "Bench Press")
            #expect(workout.exercises.first?.unilateral == true)
            #expect(workout.exercises.first?.reps == [10, 8])
            #expect(workout.exercises.first?.weights == [60, 62.5])

            #expect(legacy.schemes.map(\.name) == ["Arms"])
            #expect(legacy.schemes.first?.exercises.map(\.exerciseName) == ["My Curl"])

            // The new store works
            context.insert(Workout(name: "New"))
            try context.save()
        }

        @Test func doesntWriteAFileForAnEmptyV2Store() throws {
            defer { cleanUp() }
            try create(VersionedSchemaV2.self) { context in
                // Only data that isn't imported
                context.insert(VersionedSchemaV2.Chat(name: "Gym-AI"))
                context.insert(VersionedSchemaV2.Exercise(name: "Verified", verified: true))
            }
            let container = try openCurrent()
            #expect(try container.mainContext.fetchAll(Chat.self).isEmpty)
            #expect(!LegacyV2Data.exists)
        }

        @Test func keepsTheFileOfAnEarlierAttempt() throws {
            defer { cleanUp() }
            let earlier = LegacyV2Data(exercises: [], workouts: [LegacyV2Data.Workout(name: "Earlier", date: .now, duration: 1, inProgress: false, exercises: [])], schemes: [])
            try earlier.write()
            try create(VersionedSchemaV2.self) { context in
                context.insert(VersionedSchemaV2.Workout(name: "Later"))
            }
            _ = try openCurrent()
            #expect(try LegacyV2Data.read()?.workouts.map(\.name) == ["Earlier"])
            try LegacyV2Data.delete()
            #expect(!LegacyV2Data.exists)
        }

        @Test func migratesAV1StoreThroughV2ToV3() throws {
            defer { cleanUp() }
            try create(VersionedSchemaV1.self) { context in
                let squat = VersionedSchemaV1.Exercise(name: "Squat", muscleGroup: .legs, primaryMuscles: [.quads], equipment: .barbell, verified: true)
                context.insert(squat)
                let workout = VersionedSchemaV1.Workout(name: "Legs", time: 50, inProgress: false)
                context.insert(workout)
                let workoutExercise = VersionedSchemaV1.WorkoutExercise(exercise: squat, reps: [5], weight: [100], workout: workout, index: 0)
                context.insert(workoutExercise)
                workout.workoutExercises = [workoutExercise]
                context.insert(VersionedSchemaV1.Settings(bodyWeight: 80))
            }

            let container = try openCurrent()
            #expect(try container.mainContext.fetchAll(Workout.self).isEmpty)
            let legacy = try #require(try LegacyV2Data.read())
            #expect(legacy.workouts.map(\.name) == ["Legs"])
            #expect(legacy.workouts.first?.exercises.first?.exerciseName == "Squat")
            #expect(legacy.exercises.map(\.name) == ["Squat"])
        }
    }
}
