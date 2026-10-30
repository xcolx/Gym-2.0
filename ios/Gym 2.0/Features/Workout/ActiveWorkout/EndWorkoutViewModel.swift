//
//  EndWorkoutViewModel.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 22.10.2026.
//

import Foundation
import Observation
import OSLog

/// Ending the workout in progress, adding exercises to it before, or discarding it if nothing was entered
@MainActor
@Observable
final class EndWorkoutViewModel {

    /// What happened to the workout, the view leaves it then
    enum Outcome: Equatable {
        /// Saved with its duration in minutes
        case ended(duration: Int)
        /// Deleted, nothing was saved
        case discarded
    }

    let workout: Workout
    @ObservationIgnored private let workouts: WorkoutRepository

    var exercisesToAdd: [Exercise] = []
    var showExercisesView = false
    /// Set while asking whether the workout ended at the last change, see Workout.suggestedEnd
    var suggestedEnd: Date? = nil
    /// Set when nothing was entered, ending would delete the workout
    var asksToDiscardEmpty = false

    init(workout: Workout, workouts: WorkoutRepository) {
        self.workout = workout
        self.workouts = workouts
    }

    /// Asks first if nothing was entered or the workout probably ended earlier. Returns the outcome if it ended right away.
    func requestEnd(bodyWeight: Double) -> Outcome? {
        if !workout.hasEnteredValues(bodyWeight: bodyWeight) {
            asksToDiscardEmpty = true
        } else if let end = workout.suggestedEnd() {
            suggestedEnd = end
        } else {
            return end(bodyWeight: bodyWeight)
        }
        return nil
    }

    /// Saves the workout ended at `end`. A workout without entered values is deleted instead.
    func end(at end: Date = .now, bodyWeight: Double) -> Outcome {
        // saved first so the workout isn't in progress anymore when it leaves the path, see MainView
        if let duration = workouts.end(workout, bodyWeight: bodyWeight, at: end) {
            return .ended(duration: duration)
        }
        return .discarded
    }

    /// Like cancelling it, nothing is saved
    func discard() {
        WorkoutLastChange.remove(workout.clientUUID)
        do {
            try workouts.delete(workout)
        } catch {
            Logger.workout.error("Saving the context after discarding the workout failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    func addPickedExercises(bodyWeight: Double) {
        workout.addExercises(exercisesToAdd, bodyWeight: bodyWeight)
        exercisesToAdd = []
    }

    // The time, with the day if it wasn't today
    static func format(_ date: Date) -> String {
        date.formatted(date: Calendar.current.isDateInToday(date) ? .omitted : .abbreviated, time: .shortened)
    }
}
