//
//  WorkoutSchemeRepository.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 22.10.2026.
//

import Foundation
import SwiftData

/// The workout schemes, created and changed offline and pushed by the sync
@MainActor
struct WorkoutSchemeRepository: Repository {

    let context: ModelContext

    /// Stores a new scheme with the exercises in this order
    func create(_ scheme: WorkoutScheme, name: String, exercises: [Exercise]) {
        scheme.name = name
        context.insert(scheme)
        scheme.replaceExercises(with: exercises, context: context)
        saveLoggingErrors("the new workout scheme")
    }

    func update(_ scheme: WorkoutScheme, name: String, exercises: [Exercise]) {
        scheme.name = name
        scheme.replaceExercises(with: exercises, context: context)
        saveLoggingErrors("the edited workout scheme")
    }

    /// Notes that a workout was started from the scheme and stores the started workout, see `WorkoutRepository.start`
    func startWorkout(_ workout: Workout, from scheme: WorkoutScheme) {
        context.insert(workout)
        scheme.markPerformed()
        saveLoggingErrors("the workout started from a scheme")
    }

    /// Deleted here and, with the next sync, on the server
    func delete(_ scheme: WorkoutScheme) {
        context.deleteSynced(scheme)
        saveLoggingErrors("the deletion of a workout scheme")
    }
}
