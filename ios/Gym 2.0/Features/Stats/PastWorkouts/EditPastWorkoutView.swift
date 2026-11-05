//
//  EditPastWorkoutView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 10.09.2024.
//

import SwiftData
import SwiftUI

// Edits a copy of the workout in a scratch context that is never saved. "Save" copies the changes to the workout,
// marks only what changed for the sync and deletes the removed exercises, "Cancel" discards them.
struct EditPastWorkoutView: View {

    // The workout in the context of the app
    let workout: Workout
    let container: ModelContainer

    @Environment(\.modelContext) private var context

    init(workout: Workout, container: ModelContainer) {
        self.workout = workout
        self.container = container
    }

    var body: some View {
        EditPastWorkoutContentView(model: EditPastWorkoutViewModel(workout: workout, container: container, workouts: WorkoutRepository(context: context)))
    }
}

private struct EditPastWorkoutContentView: View {

    @State private var model: EditPastWorkoutViewModel

    @FocusState private var timeFieldFocused: Bool

    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var context
    @Environment(UserSettings.self) private var userSettings

    // The view model is created once, later ones of the parent's body are discarded
    init(model: EditPastWorkoutViewModel) {
        _model = State(initialValue: model)
    }

    var body: some View {
        @Bindable var model = model
        // The copy in the scratch context that the fields change
        @Bindable var workout = model.workout
        let exercises = workout.workoutExercises.sorted { $0.index < $1.index }
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    details(workout)

                    HStack(alignment: .firstTextBaseline) {
                        Text("Exercises")
                            .font(.title3.bold())
                        Spacer()
                        Button {
                            model.showEditSheet.toggle()
                        } label: {
                            Label("Edit", systemImage: "list.bullet")
                                .font(.subheadline.weight(.medium))
                        }
                        .accessibilityLabel("Edit exercises")
                    }
                    .padding(.horizontal, 4)
                    .padding(.top, 12)

                    if exercises.isEmpty {
                        Text("This workout has no exercises. Add them with Edit.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .padding()
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .cardBackground()
                    }

                    ForEach(Array(exercises.enumerated()), id: \.element.persistentModelID) { index, workoutExercise in
                        exerciseCard(workoutExercise, number: index + 1)
                    }
                }
                .padding(.horizontal)
                .padding(.bottom, 24)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Edit workout")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save", action: save)
                        .fontWeight(.semibold)
                        .disabled(model.trimmedName.isEmpty)
                }
            }
        }
        .modelContext(model.editContext)
        .onAppear{
            model.onAppear()
        }
        .sheet(isPresented: $model.showEditSheet, content:{
            EditPerformingWorkoutView(workout: workout, defersDeletions: true, exercisesContext: context, showsName: false)
                .modelContext(model.editContext)
        })
    }

    /// The name, the date and the duration
    private func details(_ workout: Workout) -> some View {
        @Bindable var model = model
        @Bindable var workout = workout
        return VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 4) {
                TextField("Workout name", text: $workout.name)
                    .font(.title3.weight(.semibold))
                    .autocorrectionDisabled()
                    .onChange(of: workout.name) {
                        model.nameChanged()
                    }
                if model.trimmedName.isEmpty {
                    Text("Enter a name.")
                        .font(.footnote)
                        .foregroundStyle(.red)
                }
            }
            .padding(.vertical, 12)

            Divider()

            DatePicker(selection: $workout.date, in: ...Date.now, displayedComponents: .date) {
                detailLabel("Date", systemImage: "calendar")
            }
            .padding(.vertical, 8)

            Divider()

            HStack {
                detailLabel("Duration", systemImage: "clock")
                Spacer()
                TextField("0", text: $model.enteredTime)
                    .font(.body.weight(.semibold))
                    .fontDesign(.rounded)
                    .monospacedDigit()
                    .multilineTextAlignment(.center)
                    .keyboardType(.numberPad)
                    .frame(width: 64, height: 36)
                    .background(Color(.tertiarySystemFill), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                    .focused($timeFieldFocused)
                    .onChange(of: model.enteredTime){
                        model.enteredTimeChanged()
                    }
                    .onChange(of: timeFieldFocused){
                        if !timeFieldFocused {
                            model.timeFieldLeft()
                        }
                    }
                Text("min")
                    .foregroundStyle(.secondary)
            }
            .padding(.vertical, 8)
        }
        .padding(.horizontal)
        .cardBackground()
    }

    private func detailLabel(_ title: String, systemImage: String) -> some View {
        Label {
            Text(title)
        } icon: {
            Image(systemName: systemImage)
                .foregroundStyle(userSettings.appColor)
        }
    }

    private func exerciseCard(_ workoutExercise: WorkoutExercise, number: Int) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Text("\(number)")
                    .font(.subheadline.weight(.semibold))
                    .monospacedDigit()
                    .foregroundStyle(userSettings.appColor)
                    .frame(width: 28, height: 28)
                    .background(userSettings.appColor.opacity(0.15), in: Circle())
                    .accessibilityHidden(true)
                ExerciseNameText(name: workoutExercise.exercise?.name ?? "", verified: workoutExercise.exercise?.verified ?? false)
                    .font(.headline)
                    .lineLimit(1)
            }
            // all sets: the page scrolls
            EditWorkoutExerciseView(workoutExercise: workoutExercise, limitsRows: false)
        }
        .padding()
        .cardBackground()
    }

    // Copies the changes of the copy to the workout. Only what changed is marked for the sync.
    func save() {
        model.save()
        dismiss()
    }
}
