//
//  EditPerformingWorkoutViewModel.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 22.10.2026.
//

import Foundation
import Observation
import OSLog
import SwiftUI

/// Renaming a workout, adding, removing and reordering its exercises
@MainActor
@Observable
final class EditPerformingWorkoutViewModel {

    let workout: Workout
    /// Set while editing a past workout on a scratch copy (EditPastWorkoutView): removed exercises are only deleted
    /// (also on the server) once the edit is saved, so nothing is saved here
    let defersDeletions: Bool
    /// The repository of the context of the workout
    @ObservationIgnored private let workouts: WorkoutRepository

    var exercisesToAdd: [Exercise] = []
    var showExercisesView = false
    /// While the field is empty, the workout keeps its last name, the server needs at least one character
    var title = ""

    init(workout: Workout, defersDeletions: Bool, workouts: WorkoutRepository) {
        self.workout = workout
        self.defersDeletions = defersDeletions
        self.workouts = workouts
    }

    func onAppear() {
        title = workout.name
    }

    var sortedExercises: [WorkoutExercise] {
        workout.workoutExercises.sorted { $0.index < $1.index }
    }

    /// Shortens a too long title and renames the workout, unless the title is empty
    func titleChanged() {
        if title.count > Workout.maxNameLength {
            title = String(title.prefix(Workout.maxNameLength))
        }
        let trimmed = title.trimmingCharacters(in: .whitespaces)
        if !trimmed.isEmpty && trimmed != workout.name {
            workout.name = trimmed
            workout.markChanged(includingExercises: false)
            workout.noteChange()
        }
    }

    /// Adds the exercises picked in the sheet, which may come from another context
    func addPickedExercises(bodyWeight: Double) {
        // the same exercises in the context of the workout
        let exercises = exercisesToAdd.compactMap { workouts.sameModel(as: $0) }
        workout.addExercises(exercises, bodyWeight: bodyWeight)
        exercisesToAdd = []
    }

    func deleteItems(at offsets: IndexSet) {
        let sortedWorkoutExercises = sortedExercises

        var exercisesToDelete: [WorkoutExercise] = []

        for index in offsets {
            let exerciseToDelete = sortedWorkoutExercises[index]
            exercisesToDelete.append(exerciseToDelete)
        }

        for exercise in exercisesToDelete {
            if let index = workout.workoutExercises.firstIndex(of: exercise) {
                workouts.delete(exercise, synced: !defersDeletions)
                workout.workoutExercises.remove(at: index)
            }
        }

        workout.noteChange()

        if defersDeletions {
            updateIndices()
            return
        }
        do {
            try workouts.save()
            updateIndices()
        } catch {
            Logger.workout.error("Saving the context after the deletion failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    func move(indices: IndexSet, newOffset: Int) {
        var sortedExercises = sortedExercises
        sortedExercises.move(fromOffsets: indices, toOffset: newOffset)

        for i in 0..<sortedExercises.count where sortedExercises[i].index != i {
            sortedExercises[i].index = i
            sortedExercises[i].markChanged()
        }

        workout.workoutExercises = sortedExercises
        workout.noteChange()
    }

    private func updateIndices() {
        let sortedWorkoutExercises = sortedExercises

        for i in 0..<sortedWorkoutExercises.count {
            sortedWorkoutExercises[i].index = i
        }

        workout.workoutExercises = sortedWorkoutExercises
    }
}
