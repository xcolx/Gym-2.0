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

    @Environment(\.modelContext) private var context

    var body: some View {
        EditPerformingWorkoutContentView(
            model: EditPerformingWorkoutViewModel(workout: workout, defersDeletions: defersDeletions, workouts: WorkoutRepository(context: context)),
            exercisesContext: exercisesContext ?? context
        )
    }
}

private struct EditPerformingWorkoutContentView: View {

    @State private var model: EditPerformingWorkoutViewModel
    let exercisesContext: ModelContext

    @State var editMode = EditMode.active

    @Environment(UserSettings.self) var userSettings

    // The view model is created once, later ones of the parent's body are discarded
    init(model: EditPerformingWorkoutViewModel, exercisesContext: ModelContext) {
        _model = State(initialValue: model)
        self.exercisesContext = exercisesContext
    }

    var body: some View {
        @Bindable var model = model
        VStack{

            HStack{
                TextField("Give your Workout a Name", text: $model.title)
                    .autocorrectionDisabled()
                    .padding(10)
                    .background(Color.gray.opacity(0.3), in: .rect(cornerRadius: 10))
                    .font(.title)
                    .padding(.leading, 10)
                    .onChange(of: model.title) {
                        model.titleChanged()
                    }

                Button(action: {
                    model.showExercisesView.toggle()
                }, label: {
                    Image(systemName: "plus.circle")
                        .font(.title)
                        .foregroundStyle(Color.green)
                        .padding(20)
                        .accessibilityLabel("Add exercises")
                })

            }

            List{
                ForEach(model.sortedExercises, id: \.persistentModelID) { workoutExercise in
                    Text(workoutExercise.exercise?.name ?? "")
                        .foregroundStyle(.white)
                }
                .onDelete(perform: model.deleteItems)

                .onMove(perform: model.move)
                .listRowBackground(Color.green)
            }
            .environment(\.editMode, $editMode)
            .scrollContentBackground(.hidden)

        }

        .onAppear {
            model.onAppear()
        }
        .sheet(isPresented: $model.showExercisesView, onDismiss: {
            model.addPickedExercises(bodyWeight: userSettings.bodyweight ?? 0)
        }, content:{
            ExercisesView(showExercisesView: $model.showExercisesView, exerciseList: $model.exercisesToAdd)
                .modelContext(exercisesContext)
        })

    }
}
