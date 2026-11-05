//
//  FreeWorkoutView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 19.08.2024.
//

import SwiftUI
import SwiftData

/// A workout put together from any exercises, also to repeat a past workout
struct FreeWorkoutView: View {

    @Binding var navigationStackPath: [NavigationDestination]

    @State var workoutTitle: String = ""
    @State var exerciseList: [Exercise] = []

    @Environment(\.modelContext) var context
    @Environment(UserSettings.self) var userSettings

    // A new workout can only be started if none is in progress
    @Query(filter: #Predicate<Workout> { $0.inProgress == true }) private var workoutsInProgress: [Workout]
    @State private var showsWorkoutInProgress = false

    var body: some View {
        EditWorkoutView(navStackTitle: "Free workout", workoutTitle: $workoutTitle, exerciseList: $exerciseList) {
            Button(action: start) {
                Label("Start workout", systemImage: "play.fill")
            }
            // also without exercises, they can be added during the workout
            .buttonStyle(PrimaryButtonStyle())
        }
        .inProgressWorkoutChooser(isPresented: $showsWorkoutInProgress, title: "A workout is already in progress", message: "Finish or cancel it before you start a new one.") { workout in
            navigationStackPath = [.workout(workout)]
        }
    }

    private func start() {
        guard workoutsInProgress.isEmpty else {
            showsWorkoutInProgress = true
            return
        }
        if workoutTitle == "" {
            workoutTitle = "Free workout"
        }
        let workout = Workout.create(name: workoutTitle, exercises: exerciseList, bodyWeight: userSettings.bodyweight ?? 0)
        WorkoutRepository(context: context).start(workout)
        navigationStackPath.append(.workout(workout))
    }
}
