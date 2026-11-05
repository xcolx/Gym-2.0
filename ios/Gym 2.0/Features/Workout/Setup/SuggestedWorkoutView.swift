//
//  SuggestedWorkoutView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 19.08.2024.
//

import SwiftUI
import SwiftData

/// The suggested exercises, which can be changed like a free workout or shuffled again with the same settings
struct SuggestedWorkoutView: View {

    @Binding var navigationStackPath: [NavigationDestination]

    let settings: WorkoutSuggestion.Settings

    @State var workoutTitle: String = ""
    @State var exerciseList: [Exercise]

    @Environment(\.modelContext) var context
    @Environment(UserSettings.self) var userSettings

    @Query(filter: Workout.currentWeek()) private var workoutsThisWeek: [Workout]
    @Query private var exercises: [Exercise]
    @Query private var equipment: [Equipment]

    // A new workout can only be started if none is in progress
    @Query(filter: #Predicate<Workout> { $0.inProgress == true }) private var workoutsInProgress: [Workout]
    @State private var showsWorkoutInProgress = false

    init(navigationStackPath: Binding<[NavigationDestination]>, settings: WorkoutSuggestion.Settings, exerciseList: [Exercise]) {
        _navigationStackPath = navigationStackPath
        self.settings = settings
        _exerciseList = State(initialValue: exerciseList)
    }

    var body: some View {
        EditWorkoutView(navStackTitle: "Suggested workout", workoutTitle: $workoutTitle, exerciseList: $exerciseList) {
            Button(action: shuffle) {
                Image(systemName: "shuffle")
                    .font(.headline)
                    .frame(width: 52, height: 52)
                    .background(Color(.secondarySystemFill), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            .accessibilityLabel("Shuffle")
            Button(action: start) {
                Label("Start workout", systemImage: "play.fill")
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(exerciseList.isEmpty)
        }
        .inProgressWorkoutChooser(isPresented: $showsWorkoutInProgress, title: "A workout is already in progress", message: "Finish or cancel it before you start a new one.") { workout in
            navigationStackPath = [.workout(workout)]
        }
    }

    private func shuffle() {
        withAnimation {
            exerciseList = WorkoutSuggestion.exercises(for: settings, exercises: exercises, equipment: equipment, workoutsThisWeek: workoutsThisWeek)
        }
    }

    private func start() {
        guard workoutsInProgress.isEmpty else {
            showsWorkoutInProgress = true
            return
        }
        if workoutTitle == "" {
            workoutTitle = "Suggested workout"
        }
        let workout = Workout.create(name: workoutTitle, exercises: exerciseList, bodyWeight: userSettings.bodyweight ?? 0)
        WorkoutRepository(context: context).start(workout)
        navigationStackPath.append(.workout(workout))
    }
}
