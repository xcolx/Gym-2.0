//
//  WorkoutRepository.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 22.10.2026.
//

import Foundation
import SwiftData

/// The workouts and their exercises, created and changed offline and pushed by the sync
@MainActor
struct WorkoutRepository: Repository {

    let context: ModelContext

    /// The workouts in progress, nil if they couldn't be fetched. There is at most one, a new one can only be started
    /// while there is none.
    func inProgressWorkouts() -> [Workout]? {
        try? context.fetch(FetchDescriptor<Workout>(predicate: #Predicate { $0.inProgress == true }))
    }

    /// Stores a workout that was just started and saves it right away
    func start(_ workout: Workout) {
        context.insert(workout)
        saveLoggingErrors("the started workout")
    }

    /// Stores the workouts of an import
    func insert(_ workouts: [Workout]) {
        for workout in workouts {
            context.insert(workout)
        }
        saveLoggingErrors("the imported workouts")
    }

    /// Ends the workout at `end` and saves it, see `Workout.save(_:bodyWeight:end:)`. A workout without entered
    /// values is deleted. Returns its duration in minutes, nil if it was deleted.
    func end(_ workout: Workout, bodyWeight: Double, at end: Date) -> Int? {
        workout.save(context, bodyWeight: bodyWeight, end: end)
        // read before the context is saved: save() deletes a workout without entered values, which can't be read afterwards
        let duration = workout.isDeleted ? nil : workout.duration
        saveLoggingErrors("the ended workout")
        return duration
    }

    /// Deletes the workout with its exercises, also on the server with the next sync. Throws if it couldn't be saved.
    func delete(_ workout: Workout) throws {
        context.deleteSynced(workout)
        try save()
    }

    /// Removes an exercise of a workout. `synced` also deletes it on the server with the next sync, otherwise it's
    /// only removed from the context (e.g. from a scratch copy of the workout that is never saved).
    func delete(_ workoutExercise: WorkoutExercise, synced: Bool) {
        if synced {
            context.deleteSynced(workoutExercise)
        } else {
            context.delete(workoutExercise)
        }
    }
}
