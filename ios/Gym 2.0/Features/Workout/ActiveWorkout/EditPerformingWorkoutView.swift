//
//  EditPerformingWorkoutView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 05.09.2024.
//

import SwiftData
import SwiftUI

struct EditPerformingWorkoutView: View {

    let workout: Workout

    // Set while editing a past workout on a scratch copy (EditPastWorkoutView): removed exercises are only deleted
    // (also on the server) once the edit is saved, so nothing is saved here
    var defersDeletions: Bool = false
    // The context the exercises to add are picked from. A new exercise created there is saved right away, which
    // mustn't save the scratch copy of the workout with it. Nil for the context of the workout.
    var exercisesContext: ModelContext? = nil
    /// The exercise shown in the workout in progress, highlighted in the list
    var currentExercise: WorkoutExercise? = nil
    /// Set in the workout in progress: tapping an exercise shows it there
    var onSelect: ((WorkoutExercise) -> Void)? = nil
    /// Set in the workout in progress: "Cancel workout" at the bottom, asked twice before it deletes the workout
    var onDeleteWorkout: (() -> Void)? = nil
    /// False when the name is already edited around the sheet, as when editing a past workout
    var showsName = true

    @Environment(\.modelContext) private var context

    var body: some View {
        EditPerformingWorkoutContentView(
            model: EditPerformingWorkoutViewModel(workout: workout, defersDeletions: defersDeletions, workouts: WorkoutRepository(context: context)),
            exercisesContext: exercisesContext ?? context,
            currentExercise: currentExercise,
            onSelect: onSelect,
            onDeleteWorkout: onDeleteWorkout,
            showsName: showsName
        )
    }
}

private struct EditPerformingWorkoutContentView: View {

    @State private var model: EditPerformingWorkoutViewModel
    let exercisesContext: ModelContext
    let currentExercise: WorkoutExercise?
    let onSelect: ((WorkoutExercise) -> Void)?
    let onDeleteWorkout: (() -> Void)?
    let showsName: Bool

    @State private var asksToDelete = false

    @Environment(\.dismiss) private var dismiss
    @Environment(UserSettings.self) var userSettings

    // The view model is created once, later ones of the parent's body are discarded
    init(model: EditPerformingWorkoutViewModel, exercisesContext: ModelContext, currentExercise: WorkoutExercise?, onSelect: ((WorkoutExercise) -> Void)?, onDeleteWorkout: (() -> Void)?, showsName: Bool) {
        _model = State(initialValue: model)
        self.exercisesContext = exercisesContext
        self.currentExercise = currentExercise
        self.onSelect = onSelect
        self.onDeleteWorkout = onDeleteWorkout
        self.showsName = showsName
    }

    var body: some View {
        @Bindable var model = model
        let exercises = model.sortedExercises
        NavigationStack {
            List {
                if showsName {
                    Section("Name") {
                        TextField("Workout name", text: $model.title)
                            .font(.title3.weight(.semibold))
                            .autocorrectionDisabled()
                            .onChange(of: model.title) {
                                model.titleChanged()
                            }
                    }
                }

                Section {
                    ForEach(Array(exercises.enumerated()), id: \.element.persistentModelID) { index, workoutExercise in
                        row(workoutExercise, number: index + 1)
                    }
                    .onDelete(perform: model.deleteItems)
                    .onMove(perform: model.move)

                    Button {
                        model.showExercisesView.toggle()
                    } label: {
                        Label("Add exercises", systemImage: "plus.circle.fill")
                            .font(.body.weight(.medium))
                    }
                } header: {
                    Text(exercises.count == 1 ? "1 exercise" : "\(exercises.count) exercises")
                } footer: {
                    Text(onSelect == nil ? "Hold and drag an exercise to move it, swipe to remove it." : "Tap an exercise to go to it, hold and drag to move it, swipe to remove it.")
                }

                if onDeleteWorkout != nil {
                    Section {
                        Button(role: .destructive) {
                            asksToDelete = true
                        } label: {
                            Label("Cancel workout", systemImage: "trash")
                                .foregroundStyle(.red)
                        }
                    }
                }
            }
            .navigationTitle(showsName ? "Workout" : "Exercises")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                        .fontWeight(.semibold)
                }
            }
        }
        .onAppear {
            model.onAppear()
        }
        .deleteWorkoutConfirmation(isPresented: $asksToDelete) {
            dismiss()
            onDeleteWorkout?()
        }
        .sheet(isPresented: $model.showExercisesView, onDismiss: {
            model.addPickedExercises(bodyWeight: userSettings.bodyweight ?? 0)
        }, content: {
            ExercisesView(showExercisesView: $model.showExercisesView, exerciseList: $model.exercisesToAdd)
                .modelContext(exercisesContext)
        })
    }

    private func row(_ workoutExercise: WorkoutExercise, number: Int) -> some View {
        let isCurrent = workoutExercise == currentExercise
        let bodyWeight = userSettings.bodyweight ?? 0
        let entries = (0..<workoutExercise.entryCount).filter { !workoutExercise.isEntryEmpty(at: $0, bodyWeight: bodyWeight) }
        let sets = workoutExercise.unilateral ? Set(entries.map { $0 / 2 }).count : entries.count
        return HStack(spacing: 12) {
            Text("\(number)")
                .font(.subheadline.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(isCurrent ? userSettings.appColorForeground : userSettings.appColor)
                .frame(width: 30, height: 30)
                .background(isCurrent ? userSettings.appColor : userSettings.appColor.opacity(0.15), in: Circle())
            Text(workoutExercise.exercise?.name ?? "")
                .fontWeight(isCurrent ? .semibold : .regular)
                .lineLimit(1)
            Spacer(minLength: 8)
            Text(isCurrent ? "Now" : sets == 0 ? "–" : sets == 1 ? "1 set" : "\(sets) sets")
                .font(.subheadline)
                .foregroundStyle(isCurrent ? userSettings.appColor : Color.secondary)
            Image(systemName: "line.3.horizontal")
                .foregroundStyle(.tertiary)
                .accessibilityHidden(true)
        }
        .contentShape(Rectangle())
        // a tap gesture, not a button, so that the row can still be dragged
        .onTapGesture {
            guard let onSelect else { return }
            onSelect(workoutExercise)
            dismiss()
        }
    }
}
