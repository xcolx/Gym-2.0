//
//  ImportViewModelsTests.swift
//  Gym 2.0Tests
//
//  Created by Colin Rüegg on 24.10.2026.
//
//  Importing a workout file of the stats, and uploading the data of the V2 → V3 migration after the first login
//

import Foundation
import SwiftData
import Testing
@testable import Gym_2_0

@MainActor
@Suite struct ImportWorkoutsViewModelTests {

    let store: TestStore
    var workouts: WorkoutRepository { WorkoutRepository(context: store.context) }

    init() throws {
        store = try TestStore()
    }

    /// The export of a workout with the exercise, made in a store of its own like on another device
    func exportedFile(exercise: String = "Bench Press", workoutName: String = "Push") throws -> Data {
        let other = try TestStore()
        let workout = other.workout(workoutName, exercises: [(other.exercise(exercise), Sets(reps: [10, 8], weights: [60, 62.5]))])
        return try WorkoutFile(workouts: [workout]).json()
    }

    @Test func importsTheWorkoutsOfAFileAfterTheConfirmation() throws {
        store.exercise("Bench Press")
        let model = ImportWorkoutsViewModel(workouts: workouts)

        model.importData(try exportedFile(), pathExtension: "json")

        #expect(model.importError == nil)
        #expect(model.showConfirmation)
        #expect(model.numImported == 1)
        #expect(try store.context.fetchAll(Workout.self).isEmpty)

        model.confirmImport()

        let imported = try store.context.fetchAll(Workout.self)
        #expect(imported.map(\.name) == ["Push"])
        #expect(imported.first?.workoutExercises.first?.reps == [10, 8])
        #expect(imported.first?.syncState == .created)
        #expect(model.importedWorkouts.isEmpty)
    }

    @Test func readsTheCSVExportToo() throws {
        let other = try TestStore()
        let workout = other.workout("Legs", exercises: [(other.exercise("Squat"), Sets(reps: [5], weights: [100]))])
        let csv = WorkoutFile(workouts: [workout]).csv()
        store.exercise("Squat")
        let model = ImportWorkoutsViewModel(workouts: workouts)

        model.importData(Data(csv.utf8), pathExtension: "csv")

        #expect(model.importError == nil)
        #expect(model.importedWorkouts.map(\.name) == ["Legs"])
    }

    @Test func leavesOutTheWorkoutsWithUnknownExercises() throws {
        let model = ImportWorkoutsViewModel(workouts: workouts)

        model.importData(try exportedFile(exercise: "Unknown Press"), pathExtension: "json")

        #expect(model.missingExerciseNames == ["Unknown Press"])
        #expect(model.importError == "The file doesn't contain any new workouts.")
        #expect(!model.showConfirmation)
    }

    @Test func skipsTheWorkoutsThatWereImportedBefore() throws {
        store.exercise("Bench Press")
        let file = try exportedFile()
        let model = ImportWorkoutsViewModel(workouts: workouts)
        model.importData(file, pathExtension: "json")
        model.confirmImport()

        model.importData(file, pathExtension: "json")

        #expect(model.numExisting == 1)
        #expect(model.importError == "The file doesn't contain any new workouts.")
        #expect(try store.context.fetchAll(Workout.self).count == 1)
    }

    @Test func explainsAFileItCantRead() {
        let model = ImportWorkoutsViewModel(workouts: workouts)

        model.importData(Data("not a workout file".utf8), pathExtension: "csv")

        #expect(model.importError != nil)
        #expect(!model.showConfirmation)
    }

    @Test func remembersWhichImportWasChosen() {
        let model = ImportWorkoutsViewModel(workouts: workouts)

        model.selectFile(legacy: true)

        #expect(model.isLegacyImport)
        #expect(model.showImporter)
    }
}

extension GlobalStateTests {

    /// The legacy data is a file in Application Support
    @MainActor
    @Suite struct LegacyImportServiceTests {

        let globalState = GlobalStateSnapshot()
        let backend = FakeBackend()

        func service() -> LegacyImportService {
            let api = StubURLProtocol.client(handler: backend.handle)
            return LegacyImportService(exerciseService: ExerciseService(api: api), workoutService: WorkoutService(api: api), workoutSchemeService: WorkoutSchemeService(api: api))
        }

        /// A workout with the exercise of the fake backend (Squat, ID 7)
        func writeLegacyData(exercise: String = "Squat") throws {
            let squat = LegacyV2Data.Exercise(clientUUID: nil, name: exercise, exerciseDescription: "", image: nil, muscleGroup: "Legs", primaryMuscles: [], secondaryMuscles: [], equipment: "Barbell", verified: true)
            let workout = LegacyV2Data.Workout(name: "Legs", date: isoDate("2024-05-01T08:00:00Z"), duration: 50, inProgress: false, exercises: [
                LegacyV2Data.WorkoutExercise(exerciseName: exercise, unilateral: false, index: 0, reps: [5, 5], weights: [100, 100]),
            ])
            try LegacyV2Data(exercises: [squat], workouts: [workout], schemes: []).write()
        }

        func acceptWorkouts() {
            backend.on("POST", "/workouts") { request in
                .json(FakeBackend.workoutJSON(id: 50, clientUUID: request.json?["client_uuid"] as? String, name: "Legs", exercises: []), status: 201)
            }
        }

        @Test func uploadsTheWorkoutsAndDeletesTheFile() async throws {
            try writeLegacyData()
            acceptWorkouts()
            let service = service()
            #expect(service.isPending)

            await service.importData()

            #expect(service.state == .idle)
            #expect(!service.isPending)
            #expect(!LegacyV2Data.exists)
            let uploads = backend.requests("POST", "/workouts")
            #expect(uploads.count == 1)
            let upload = try #require(uploads.first)
            #expect(upload.json?["name"] as? String == "Legs")
            #expect(upload.json?["client_uuid"] as? String != nil)
        }

        @Test func keepsTheClientUUIDsForASecondTryAfterAFailure() async throws {
            try writeLegacyData()
            backend.on("POST", "/workouts") { _ in .json(#"{"detail": "Server down"}"#, status: 500) }
            let service = service()

            await service.importData()

            guard case .failed = service.state else {
                Issue.record("Expected a failed import, got \(service.state)")
                return
            }
            #expect(service.isPending)
            let firstUUID = backend.requests("POST", "/workouts").first?.json?["client_uuid"] as? String
            #expect(try LegacyV2Data.read()?.workouts.first?.clientUUID?.uuidString == firstUUID)

            acceptWorkouts()
            await service.importData()

            #expect(service.state == .idle)
            #expect(backend.requests("POST", "/workouts").map { $0.json?["client_uuid"] as? String } == [firstUUID, firstUUID])
        }

        @Test func listsWhatDoesntFitTheServer() async throws {
            try writeLegacyData(exercise: "Deleted Exercise")
            let service = service()

            await service.importData()

            guard case .unmatched(let issues) = service.state else {
                Issue.record("Expected unmatched data, got \(service.state)")
                return
            }
            #expect(!issues.isEmpty)
            #expect(backend.requests("POST", "/workouts").isEmpty)
            #expect(LegacyV2Data.exists)
        }

        @Test func treatsARejectionAsDataThatDoesntFit() async throws {
            try writeLegacyData()
            backend.on("POST", "/workouts") { _ in .json(#"{"detail": "Duration too long"}"#, status: 422) }
            let service = service()

            await service.importData()

            #expect(service.state == .unmatched(issues: ["Duration too long"]))
        }

        @Test func waitsForTheNextLoginIfTheSessionEnded() async throws {
            try writeLegacyData()
            backend.on("GET", "/exercises") { _ in .json(#"{"detail": "Not authenticated"}"#, status: 401) }
            let service = service()

            await service.importData()

            #expect(service.state == .idle)
            #expect(service.isPending)
        }

        @Test func finishesRightAwayWithoutData() async throws {
            try LegacyV2Data(exercises: [], workouts: [], schemes: []).write()
            let service = service()

            await service.importData()

            #expect(service.state == .idle)
            #expect(!LegacyV2Data.exists)
            #expect(backend.paths.isEmpty)
        }

        @Test func discardDeletesTheData() throws {
            try writeLegacyData()
            let service = service()

            try service.discard()

            #expect(!service.isPending)
            #expect(!LegacyV2Data.exists)
        }
    }
}
