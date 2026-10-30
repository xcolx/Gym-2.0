//
//  EditPastWorkoutViewModel.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 22.10.2026.
//

import Foundation
import Observation
import OSLog
import SwiftData

/// Edits a copy of a finished workout in a scratch context that is never saved. Saving copies the changes to the
/// workout, marks only what changed for the sync and deletes the removed exercises, cancelling discards them.
@MainActor
@Observable
final class EditPastWorkoutViewModel {

    /// The workout in the context of the app
    let original: Workout
    /// The context of the copy, never saved
    let editContext: ModelContext
    /// The copy in `editContext` that the fields change
    let workout: Workout
    /// The repository of the context of the app
    @ObservationIgnored private let workouts: WorkoutRepository

    var enteredTime = ""
    var showEditSheet = false

    init(workout: Workout, container: ModelContainer, workouts: WorkoutRepository) {
        original = workout
        let editContext = ModelContext(container)
        editContext.autosaveEnabled = false
        self.editContext = editContext
        self.workout = editContext.model(for: workout.persistentModelID) as? Workout ?? workout
        self.workouts = workouts
    }

    var trimmedName: String {
        workout.name.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    func onAppear() {
        enteredTime = String(workout.duration)
    }

    func nameChanged() {
        if workout.name.count > Workout.maxNameLength {
            workout.name = String(workout.name.prefix(Workout.maxNameLength))
        }
    }

    /// An empty field is allowed while typing, the old value returns once the field is left
    func enteredTimeChanged() {
        if enteredTime.isEmpty {
            return
        }
        if let value = Int(enteredTime) {
            // at most a day, like the server
            workout.duration = min(value, Workout.maxDuration)
            if value > Workout.maxDuration {
                enteredTime = String(Workout.maxDuration)
            }
        } else {
            enteredTime = String(workout.duration)
        }
    }

    func timeFieldLeft() {
        if enteredTime.isEmpty {
            enteredTime = String(workout.duration)
        }
    }

    /// Copies the changes of the copy to the workout. Only what changed is marked for the sync.
    func save() {
        guard !trimmedName.isEmpty, !original.isGone else { return }

        let name = trimmedName
        if original.name != name || original.date != workout.date || original.duration != workout.duration {
            original.name = name
            original.date = workout.date
            original.duration = workout.duration
            original.markChanged(includingExercises: false)
        }

        // Matched by their identifier, the exercises added to the copy have one that the workout doesn't know
        var remaining = Dictionary(original.workoutExercises.map { ($0.persistentModelID, $0) }, uniquingKeysWith: { first, _ in first })
        var exercises: [WorkoutExercise] = []
        for copy in workout.workoutExercises {
            if let existing = remaining.removeValue(forKey: copy.persistentModelID) {
                if existing.copyChanges(from: copy) {
                    existing.markChanged()
                }
                exercises.append(existing)
            } else if let exercise = copy.exercise.flatMap({ workouts.sameModel(as: $0) }) {
                exercises.append(WorkoutExercise(workout: original, exercise: exercise, unilateral: copy.unilateral, index: copy.index, reps: copy.reps, weights: copy.weights, time: copy.time, intensity: copy.intensity, distance: copy.distance))
            }
        }
        // removed from the copy, deleted on the server with the next sync
        for workoutExercise in remaining.values {
            workouts.delete(workoutExercise, synced: true)
        }
        original.workoutExercises = exercises

        do {
            try workouts.save()
        } catch {
            Logger.workout.error("Saving the edited workout failed: \(error.localizedDescription, privacy: .public)")
        }
    }
}

private extension WorkoutExercise {
    // Takes the sets and the position over, returns whether something changed
    func copyChanges(from copy: WorkoutExercise) -> Bool {
        guard unilateral != copy.unilateral || index != copy.index || reps != copy.reps || weights != copy.weights
            || time != copy.time || intensity != copy.intensity || distance != copy.distance
        else { return false }
        unilateral = copy.unilateral
        index = copy.index
        reps = copy.reps
        weights = copy.weights
        time = copy.time
        intensity = copy.intensity
        distance = copy.distance
        return true
    }
}
