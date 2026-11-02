//
//  EndWorkoutView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 24.08.2024.
//

import SwiftData
import SwiftUI

struct EndWorkoutView: View {

    let workout: Workout
    @Binding var navigationStackPath: [NavigationDestination]
    // Presented by WhilstWorkoutView, this view is a page of its TabView
    @Binding var showExercisesView: Bool

    @Environment(\.modelContext) private var context

    var body: some View {
        EndWorkoutContentView(model: EndWorkoutViewModel(workout: workout, workouts: WorkoutRepository(context: context)), navigationStackPath: $navigationStackPath, showExercisesView: $showExercisesView)
    }
}

private struct EndWorkoutContentView: View {

    @State private var model: EndWorkoutViewModel
    @Binding var navigationStackPath: [NavigationDestination]
    @Binding var showExercisesView: Bool

    @Environment(UserSettings.self) var userSettings
    @Environment(\.celebrateWorkout) private var celebrateWorkout

    // The view model is created once, later ones of the parent's body are discarded
    init(model: EndWorkoutViewModel, navigationStackPath: Binding<[NavigationDestination]>, showExercisesView: Binding<Bool>) {
        _model = State(initialValue: model)
        _navigationStackPath = navigationStackPath
        _showExercisesView = showExercisesView
    }

    private var bodyWeight: Double {
        userSettings.bodyweight ?? 0
    }

    var body: some View {
        @Bindable var model = model
        VStack{

            Spacer()

            Text("You are done!")
                .font(.largeTitle)
            Text("Or are you?")
                .font(.largeTitle)

            Spacer()

            Button(action: {
                showExercisesView.toggle()
            }, label: {
                Image(systemName: "plus.circle")
                    .font(.system(size: 100))
                    .foregroundStyle(Color.green)
                    .accessibilityLabel("Add exercise")
            })
            Text("Add exercise")
                .font(.title)

            Spacer()

            Button(action: {
                if let outcome = model.requestEnd(bodyWeight: bodyWeight) {
                    leave(after: outcome)
                }
            }, label: {
                Text("End Workout")
                    .foregroundStyle(Color("MyWhite"))
                    .font(.title)
                    .padding(15)
                    .background(
                        RoundedRectangle(cornerRadius: 25)
                            .tint(Color("MyBlack"))
                    )
            })
            .alert(
                "End the workout at your last change?",
                isPresented: Binding(get: { model.suggestedEnd != nil }, set: { if !$0 { model.suggestedEnd = nil } }),
                presenting: model.suggestedEnd
            ) { end in
                Button("End at \(EndWorkoutViewModel.format(end))") {
                    leave(after: model.end(at: end, bodyWeight: bodyWeight))
                }
                .keyboardShortcut(.defaultAction)
                Button("End now") {
                    leave(after: model.end(bodyWeight: bodyWeight))
                }
                Button("Go back", role: .cancel) {}
            } message: { end in
                Text("Your last change was at \(EndWorkoutViewModel.format(end)). Did the workout end then?")
            }
            .alert("Nothing entered", isPresented: $model.asksToDiscardEmpty) {
                Button("Go back", role: .cancel) {}
                Button("Discard", role: .destructive) {
                    model.discard()
                    navigationStackPath = []
                }
            } message: {
                Text("No set of this workout has a value, so there is nothing to save. Do you want to discard the workout?")
            }


            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color("MyGray"))
    }

    /// Leaves the workout, celebrating it if it was saved
    private func leave(after outcome: EndWorkoutViewModel.Outcome) {
        navigationStackPath = []
        if case .ended(let duration) = outcome {
            celebrateWorkout(duration)
        }
    }
}
