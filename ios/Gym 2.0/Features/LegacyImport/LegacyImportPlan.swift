//
//  LegacyImportPlan.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 05.10.2026.
//

import Foundation

/// The requests that upload the legacy V2 data, or the reasons why it can't be uploaded.
///
/// Exercises are matched by name: verified V2 exercises to the verified exercises of the server, custom ones are
/// created again. Everything is matched before anything is uploaded, so that the data is imported completely or not at all.
struct LegacyImportPlan {

    /// Where a workout or scheme exercise points to. Custom exercises get their server id when they are created.
    enum ExerciseReference: Equatable {
        case server(id: Int)
        case custom(legacyName: String)
    }

    struct CustomExercise {
        let legacyName: String
        let draft: ExerciseDraft
        let image: ImageUpload?
    }

    struct PlannedWorkout {
        let workout: NewWorkout
        /// Same order as `workout.exercises`, their exercise ids are filled in by `resolved(_:)`.
        let references: [ExerciseReference]

        func resolved(_ customIds: [String: Int]) -> NewWorkout {
            var workout = workout
            for index in workout.exercises.indices {
                workout.exercises[index].exerciseId = references[index].id(customIds)
            }
            return workout
        }
    }

    struct PlannedScheme {
        let scheme: NewWorkoutScheme
        let references: [ExerciseReference]

        func resolved(_ customIds: [String: Int]) -> NewWorkoutScheme {
            var scheme = scheme
            for index in scheme.exercises.indices {
                scheme.exercises[index].exerciseId = references[index].id(customIds)
            }
            return scheme
        }
    }

    let customExercises: [CustomExercise]
    let schemes: [PlannedScheme]
    let workouts: [PlannedWorkout]

    var requestCount: Int {
        customExercises.count + schemes.count + workouts.count
    }

    /// Server limits, see backend/app/schemas/workouts.py and exercises.py
    private enum Limits {
        static let workoutName = 25
        static let exerciseName = 50
        static let exerciseDescription = 1000
        static let duration = 0...1440
        static let exercises = 100
        static let sets = 100
        static let reps = 0...9999
        static let weight = -9999.9...9999.9
    }

    /// Which metrics an exercise tracks per set
    private struct Tracking {
        var reps = true
        var weights = true
        // V2 didn't have these, they are imported as 0
        var time = false
        var intensity = false
        var distance = false

        init() {}

        init(_ exercise: ExerciseDTO) {
            reps = exercise.reps
            weights = exercise.weights
            time = exercise.time
            intensity = exercise.intensity
            distance = exercise.distance
        }
    }

    /// The plan, or the reasons why the data doesn't fit the server, one per problem.
    static func make(
        from data: LegacyV2Data,
        serverExercises: [ExerciseDTO],
        muscleGroups: [MuscleGroupDTO],
        equipment: [EquipmentDTO],
        muscles: [MuscleDTO]
    ) -> Result<LegacyImportPlan, UnmatchedLegacyData> {
        var issues: [String] = []
        func report(_ issue: String) {
            if !issues.contains(issue) { issues.append(issue) }
        }

        // Custom exercises win over verified ones with the same name, since V2 referenced exercises only by name
        var legacyExercises: [String: LegacyV2Data.Exercise] = [:]
        for exercise in data.exercises where legacyExercises[exercise.name] == nil || !exercise.verified {
            legacyExercises[exercise.name] = exercise
        }

        var verifiedByName: [String: ExerciseDTO] = [:]
        for exercise in serverExercises where exercise.verified {
            verifiedByName[normalized(exercise.name)] = verifiedByName[normalized(exercise.name)] ?? exercise
        }

        var customExercises: [CustomExercise] = []
        for legacy in data.exercises where !legacy.verified && legacyExercises[legacy.name]?.clientUUID == legacy.clientUUID {
            let muscleGroupId = muscleGroups.first { normalized($0.name) == normalized(legacy.muscleGroup) }?.id
            let equipmentId = equipment.first { normalized($0.name) == normalized(legacy.equipment) }?.id
            if muscleGroupId == nil {
                report("The muscle group “\(legacy.muscleGroup)” of your exercise “\(legacy.name)” doesn't exist anymore.")
            }
            if equipmentId == nil {
                report("The equipment “\(legacy.equipment)” of your exercise “\(legacy.name)” doesn't exist anymore.")
            }
            func muscleIds(_ names: [String]) -> [Int] {
                names.compactMap { name in
                    guard let muscle = muscles.first(where: { normalized($0.name) == normalized(name) }) else {
                        report("The muscle “\(name)” of your exercise “\(legacy.name)” doesn't exist anymore.")
                        return nil
                    }
                    return muscle.id
                }
            }
            let primaryMuscleIds = muscleIds(legacy.primaryMuscles)
            let secondaryMuscleIds = muscleIds(legacy.secondaryMuscles)

            guard let muscleGroupId, let equipmentId else { continue }
            let description = legacy.exerciseDescription.trimmingCharacters(in: .whitespacesAndNewlines)
            let draft = ExerciseDraft(
                clientUuid: legacy.clientUUID,
                name: String(legacy.name.trimmingCharacters(in: .whitespacesAndNewlines).prefix(Limits.exerciseName)),
                description: description.isEmpty ? nil : String(description.prefix(Limits.exerciseDescription)),
                muscleGroupId: muscleGroupId,
                equipmentId: equipmentId,
                primaryMuscleIds: primaryMuscleIds,
                secondaryMuscleIds: secondaryMuscleIds,
                reps: true,
                weights: true
            )
            customExercises.append(CustomExercise(legacyName: legacy.name, draft: draft, image: legacy.image.flatMap(ImageUpload.init(detecting:))))
        }

        func reference(for name: String) -> (ExerciseReference, Tracking)? {
            if let legacy = legacyExercises[name], !legacy.verified {
                return (.custom(legacyName: name), Tracking())
            }
            guard let exercise = verifiedByName[normalized(name)] else {
                report("The exercise “\(name)” doesn't exist anymore.")
                return nil
            }
            return (.server(id: exercise.id), Tracking(exercise))
        }

        var schemes: [PlannedScheme] = []
        for legacy in data.schemes {
            let sorted = legacy.exercises.sorted { $0.index < $1.index }
            if sorted.count > Limits.exercises {
                report("The workout scheme “\(legacy.name)” has more than \(Limits.exercises) exercises.")
            }
            let references = sorted.compactMap { reference(for: $0.exerciseName)?.0 }
            guard references.count == sorted.count else { continue }

            let scheme = NewWorkoutScheme(
                clientUuid: legacy.clientUUID,
                name: name(legacy.name, fallback: "Workout Scheme"),
                exercises: references.indices.map { WorkoutSchemeExerciseDraft(exerciseId: 0, index: $0) }
            )
            schemes.append(PlannedScheme(scheme: scheme, references: references))
        }

        var workouts: [PlannedWorkout] = []
        for legacy in data.workouts {
            let workoutName = name(legacy.name, fallback: "Workout")
            let sorted = legacy.exercises.sorted { $0.index < $1.index }
            if sorted.count > Limits.exercises {
                report("The workout “\(workoutName)” from \(legacy.date.formatted(date: .abbreviated, time: .omitted)) has more than \(Limits.exercises) exercises.")
            }

            var references: [ExerciseReference] = []
            var drafts: [WorkoutExerciseDraft] = []
            for legacyExercise in sorted {
                guard let match = reference(for: legacyExercise.exerciseName) else { continue }
                let (reference, tracking) = match
                let setCount = min(legacyExercise.reps.count, legacyExercise.weights.count)
                let reps = Array(legacyExercise.reps.prefix(setCount))
                // The server stores weights with one decimal
                let weights = legacyExercise.weights.prefix(setCount).map { ($0 * 10).rounded() / 10 }

                // Metrics the exercise doesn't track anymore are left out, so only the kept values are checked
                let problem: String? =
                    if setCount > Limits.sets { "has more than \(Limits.sets) sets" }
                    else if tracking.reps && !reps.allSatisfy(Limits.reps.contains) { "has reps the server doesn't accept" }
                    else if tracking.weights && !weights.allSatisfy(Limits.weight.contains) { "has weights the server doesn't accept" }
                    else { nil }
                if let problem {
                    report("“\(legacyExercise.exerciseName)” in the workout “\(workoutName)” from \(legacy.date.formatted(date: .abbreviated, time: .omitted)) \(problem).")
                    continue
                }

                references.append(reference)
                drafts.append(WorkoutExerciseDraft(
                    exerciseId: 0,
                    unilateral: legacyExercise.unilateral,
                    index: drafts.count,
                    reps: tracking.reps ? reps : nil,
                    weights: tracking.weights ? weights : nil,
                    time: tracking.time ? Array(repeating: 0, count: setCount) : nil,
                    intensity: tracking.intensity ? Array(repeating: 0, count: setCount) : nil,
                    distance: tracking.distance ? Array(repeating: 0, count: setCount) : nil
                ))
            }
            guard drafts.count == sorted.count else { continue }

            // A workout that was in progress during the update is imported as finished
            let workout = NewWorkout(
                clientUuid: legacy.clientUUID,
                name: workoutName,
                date: legacy.date,
                duration: min(max(legacy.duration, Limits.duration.lowerBound), Limits.duration.upperBound),
                inProgress: false,
                exercises: drafts
            )
            workouts.append(PlannedWorkout(workout: workout, references: references))
        }

        guard issues.isEmpty else {
            return .failure(UnmatchedLegacyData(issues: issues))
        }
        return .success(LegacyImportPlan(customExercises: customExercises, schemes: schemes, workouts: workouts))
    }

    private static func normalized(_ name: String) -> String {
        name.trimmingCharacters(in: .whitespacesAndNewlines).folding(options: [.caseInsensitive, .diacriticInsensitive], locale: nil)
    }

    private static func name(_ name: String, fallback: String) -> String {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        return String((trimmed.isEmpty ? fallback : trimmed).prefix(Limits.workoutName))
    }
}

struct UnmatchedLegacyData: Error {
    let issues: [String]
}

private extension LegacyImportPlan.ExerciseReference {
    func id(_ customIds: [String: Int]) -> Int {
        switch self {
        case .server(let id): id
        case .custom(let legacyName): customIds[legacyName]!
        }
    }
}
