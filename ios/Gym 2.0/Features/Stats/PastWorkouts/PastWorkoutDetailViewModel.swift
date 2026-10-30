//
//  PastWorkoutDetailViewModel.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 22.05.2025.
//

import Foundation
import Observation
import OSLog

/// Continuing, repeating and deleting a finished workout
@MainActor
@Observable
final class PastWorkoutDetailViewModel {

    @ObservationIgnored private let workouts: WorkoutRepository

    init(workouts: WorkoutRepository) {
        self.workouts = workouts
    }

    /// Continues the workout if no other one is in progress, returns whether it was continued
    func continueWorkout(_ workout: Workout) -> Bool {
        if workouts.inProgressWorkouts()?.isEmpty ?? false {
            workout.inProgress = true
            // Started its duration ago, so that the timer continues where it stopped
            workout.date = Date().addingTimeInterval(-Double(workout.duration) * 60)
            workout.markChanged(includingExercises: false)
            // e.g. left from a time it was in progress before and ended on another device
            WorkoutLastChange.remove(workout.clientUUID)
            return true
        }
        return false
    }

    // The exercises of the workout in the order they were done, deleted ones left out.
    // nil while a workout is in progress, which the workout tab would show instead.
    func exercisesToRepeat(_ workout: Workout) -> [Exercise]? {
        guard workouts.inProgressWorkouts()?.isEmpty ?? false else { return nil }
        return workout.workoutExercises
            .sorted { $0.index < $1.index }
            .compactMap(\.exercise)
            .filter { !$0.isGone }
    }

    /// Deletes the workout, also on the server with the next sync
    func delete(_ workout: Workout) {
        do {
            try workouts.delete(workout)
        } catch {
            Logger.workout.error("Saving the context after deleting the workout failed: \(error.localizedDescription, privacy: .public)")
        }
    }
}
