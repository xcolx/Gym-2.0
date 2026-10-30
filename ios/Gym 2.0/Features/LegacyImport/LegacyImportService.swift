//
//  LegacyImportService.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 05.10.2026.
//

import Foundation
import Observation
import OSLog

/// Uploads the workouts, schemes and custom exercises the V2 → V3 migration wrote to `LegacyV2Data.json`.
///
/// Runs after the first login and has to finish before the app can be used. Every create carries a client UUID that
/// is kept in the file, so an import that failed halfway can be started again without creating duplicates.
/// The file is deleted once everything is on the server, or when the user decides to not import it.
@MainActor
@Observable
final class LegacyImportService {

    enum State: Equatable {
        case idle
        case importing(done: Int, total: Int)
        /// The server couldn't be reached or failed. Trying again may work.
        case failed(message: String)
        /// The data doesn't fit the server (e.g. an exercise doesn't exist anymore). Trying again won't help,
        /// the user can download the data and continue without it.
        case unmatched(issues: [String])
    }

    private(set) var state: State = .idle
    /// Whether there is legacy data that still has to be imported
    private(set) var isPending: Bool = LegacyV2Data.exists

    @ObservationIgnored private let exerciseService: ExerciseService
    @ObservationIgnored private let workoutService: WorkoutService
    @ObservationIgnored private let workoutSchemeService: WorkoutSchemeService

    init(exerciseService: ExerciseService, workoutService: WorkoutService, workoutSchemeService: WorkoutSchemeService) {
        self.exerciseService = exerciseService
        self.workoutService = workoutService
        self.workoutSchemeService = workoutSchemeService
    }

    func importData() async {
        if case .importing = state { return }
        state = .importing(done: 0, total: 0)

        do {
            guard var data = try LegacyV2Data.read(), !data.isEmpty else {
                Logger.legacyImport.info("No legacy data to import")
                try finish()
                return
            }
            if data.assignClientUUIDs() {
                try data.write()
            }

            let plan: LegacyImportPlan
            switch try await makePlan(for: data) {
            case .success(let result):
                plan = result
            case .failure(let unmatched):
                Logger.legacyImport.info("Legacy data doesn't match the server: \(unmatched.issues.count) issues")
                state = .unmatched(issues: unmatched.issues)
                return
            }

            Logger.legacyImport.info("Uploading \(plan.customExercises.count) exercises, \(plan.schemes.count) schemes, \(plan.workouts.count) workouts")
            try await upload(plan)
            Logger.legacyImport.info("Legacy data imported")
            try finish()
        } catch let error as APIError {
            handle(error)
        } catch is CancellationError {
            state = .idle
        } catch {
            Logger.legacyImport.error("Legacy import failed: \(error.localizedDescription, privacy: .public)")
            state = .failed(message: error.localizedDescription)
        }
    }

    /// Deletes the legacy data without importing it. The user had the chance to download it before.
    func discard() throws {
        try finish()
    }

    /// The legacy data as a JSON file with everything and a CSV file with the workouts, to share or save.
    func exportFiles() throws -> [URL] {
        try LegacyV2DataExport.write()
    }

    // MARK: - Import

    private func makePlan(for data: LegacyV2Data) async throws -> Result<LegacyImportPlan, UnmatchedLegacyData> {
        let exercises = try await exerciseService.all().exercises

        // The reference data is only needed to create the custom exercises again
        var muscleGroups: [MuscleGroupDTO] = []
        var equipment: [EquipmentDTO] = []
        var muscles: [MuscleDTO] = []
        if data.exercises.contains(where: { !$0.verified }) {
            muscleGroups = try await exerciseService.muscleGroups()
            equipment = try await exerciseService.equipment()
            muscles = try await exerciseService.muscles()
        }

        return LegacyImportPlan.make(from: data, serverExercises: exercises, muscleGroups: muscleGroups, equipment: equipment, muscles: muscles)
    }

    private func upload(_ plan: LegacyImportPlan) async throws {
        var done = 0
        func advance() {
            done += 1
            state = .importing(done: done, total: plan.requestCount)
        }
        state = .importing(done: 0, total: plan.requestCount)

        var customIds: [String: Int] = [:]
        for exercise in plan.customExercises {
            try Task.checkCancellation()
            customIds[exercise.legacyName] = try await createExercise(exercise).id
            advance()
        }
        for scheme in plan.schemes {
            try Task.checkCancellation()
            _ = try await workoutSchemeService.create(scheme.resolved(customIds))
            advance()
        }
        for workout in plan.workouts {
            try Task.checkCancellation()
            _ = try await workoutService.create(workout.resolved(customIds))
            advance()
        }
    }

    /// An image the server rejects shouldn't block the import, the exercise is created without it then.
    private func createExercise(_ exercise: LegacyImportPlan.CustomExercise) async throws -> ExerciseDTO {
        guard let image = exercise.image else {
            return try await exerciseService.create(exercise.draft)
        }
        do {
            return try await exerciseService.create(exercise.draft, images: [image])
        } catch APIError.server(let status, _, _) where status != 429 && (400..<500).contains(status) {
            return try await exerciseService.create(exercise.draft)
        }
    }

    private func finish() throws {
        try LegacyV2Data.delete()
        isPending = false
        state = .idle
    }

    private func handle(_ error: APIError) {
        Logger.legacyImport.error("Legacy import failed: \(error.localizedDescription, privacy: .public)")
        switch error {
        case .unauthorized:
            // The session ended, AuthService shows the login again. The import starts again after the next login.
            state = .idle
        case .transport(let urlError) where urlError.code == .cancelled:
            state = .idle
        case .server(let status, _, let message) where status != 408 && status != 429 && (400..<500).contains(status):
            // The server rejected the data, sending it again won't change that
            state = .unmatched(issues: [message])
        default:
            state = .failed(message: error.localizedDescription)
        }
    }
}
