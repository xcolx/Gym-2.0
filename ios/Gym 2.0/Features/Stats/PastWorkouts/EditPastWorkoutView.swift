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

    // The view model is created once, later ones of the parent's body are discarded
    init(model: EditPastWorkoutViewModel) {
        _model = State(initialValue: model)
    }

    var body: some View {
        @Bindable var model = model
        // The copy in the scratch context that the fields change
        @Bindable var workout = model.workout
        VStack{

            HStack{
                Button(action: {
                    dismiss()
                }, label: {
                    Image(systemName: "xmark")
                        .font(.title)
                        .foregroundStyle(Color.red)
                        .padding(.leading, 10)
                        .accessibilityLabel("Cancel")
                })

                TextField("Name of the Workout", text: $workout.name)
                    .autocorrectionDisabled()
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                    .padding(.vertical, 10)
                    .font(.title)
                    .onChange(of: workout.name) {
                        model.nameChanged()
                    }
                Button(action: save, label: {
                    Image(systemName: "square.and.arrow.down")
                        .font(.title)
                        .foregroundStyle(model.trimmedName.isEmpty ? Color.gray : Color.green)
                        .padding(.trailing, 10)
                        .padding(.vertical, 10)
                        .accessibilityLabel("Save")
                })
                .disabled(model.trimmedName.isEmpty)
            }

            if model.trimmedName.isEmpty {
                Text("Enter a name.")
                    .font(.caption)
                    .foregroundStyle(Color.red)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 10)
            }

            DatePicker(selection: $workout.date, in: ...Date.now, displayedComponents: .date){
                Text("Date")
                    .font(.headline)
            }
            .padding(10)

            HStack{
                Text("Duration in Minutes")
                Spacer()
                TextField("", text: $model.enteredTime)
                    .font(.headline)
                    .multilineTextAlignment(.center)
                    .keyboardType(.numberPad)
                    .background(Color.gray.opacity(0.3), in: .rect(cornerRadius: 10))
                    .focused($timeFieldFocused)
                    .onChange(of: model.enteredTime){
                        model.enteredTimeChanged()
                    }
                    .onChange(of: timeFieldFocused){
                        if !timeFieldFocused {
                            model.timeFieldLeft()
                        }
                    }
            }
            .padding(10)
            .padding(.bottom, 10)

            HStack{
                Text("Exercises")
                    .font(.title)
                Button(action: {
                    model.showEditSheet.toggle()
                }, label: {
                    Image(systemName: "pencil")
                        .accessibilityLabel("Edit exercises")
                })
            }



            ScrollView{
                VStack{
                    ForEach(workout.workoutExercises.sorted(by: {$0.index < $1.index}), id: \.persistentModelID) { workoutExercise in
                        Text(workoutExercise.exercise?.name ?? "")
                            .padding(.leading, 10)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .font(.headline)
                        EditWorkoutExerciseView(workoutExercise: workoutExercise)
                            .padding(.bottom, 30)
                    }
                }
            }
            .scrollContentBackground(.hidden)


        }
        .modelContext(model.editContext)
        .onAppear{
            model.onAppear()
        }
        .sheet(isPresented: $model.showEditSheet, content:{
            EditPerformingWorkoutView(workout: workout, defersDeletions: true, exercisesContext: context)
                .modelContext(model.editContext)
        })
    }

    // Copies the changes of the copy to the workout. Only what changed is marked for the sync.
    func save() {
        model.save()
        dismiss()
    }
}
