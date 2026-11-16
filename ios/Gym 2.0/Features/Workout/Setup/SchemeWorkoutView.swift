//
//  SchemeWorkoutView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 19.08.2024.
//

import SwiftUI
import SwiftData

struct SchemeWorkoutView: View {
    
    @State var workoutScheme: WorkoutScheme
    
    @Binding var navigationStackPath: [NavigationDestination]
    
    @State var localName: String = ""
    @State var localExercises: [Exercise] = []
    
    @State var showSaveForTheFutureAlert: Bool = false
    
    @Environment(\.modelContext) var context
    @Environment(UserSettings.self) var userSettings
    
    // A new workout can only be started if none is in progress
    @Query(filter: #Predicate<Workout> { $0.inProgress == true }) private var workoutsInProgress: [Workout]
    @State private var showsWorkoutInProgress = false
    /// Counts the started workouts, the trigger of the haptic
    @State private var startedWorkouts = 0
        
    var body: some View {
        
        EditWorkoutView(navStackTitle: workoutScheme.name, workoutTitle: $localName, exerciseList: $localExercises) {
            Button(action: start) {
                Label("Start workout", systemImage: "play.fill")
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(localExercises.isEmpty)
        }
            // A local copy of the title and the list, so that the changes aren't saved into the model right away
            .onAppear {
                localName = workoutScheme.name
                
                localExercises = workoutScheme.sortedExercises
            }
            .alert("Do you want to save these changes for future use?", isPresented: $showSaveForTheFutureAlert) {
                Button("Just once", role: .cancel) { startWorkout() }
                Button("Save for the future") {
                    WorkoutSchemeRepository(context: context).update(workoutScheme, name: localName, exercises: localExercises)
                    startWorkout()
                }
            } message: {
                Text("Otherwise it's only changed for this time.")
            }
            .sensoryFeedback(.impact(weight: .medium), trigger: startedWorkouts)
            .inProgressWorkoutChooser(isPresented: $showsWorkoutInProgress, title: "A workout is already in progress", message: "Finish or cancel it before you start a new one.") { workout in
                navigationStackPath = [.workout(workout)]
            }
    }

    private func start() {
        guard workoutsInProgress.isEmpty else {
            showsWorkoutInProgress = true
            return
        }
        if workoutScheme.sortedExercises != localExercises || workoutScheme.name != localName {
            // The workout only starts with the answer: pushing its view right away would dismiss the alert
            showSaveForTheFutureAlert = true
        } else {
            startWorkout()
        }
    }

    private func startWorkout() {
        let workout = Workout.create(name: localName, exercises: localExercises, bodyWeight: userSettings.bodyweight ?? 0)
        WorkoutSchemeRepository(context: context).startWorkout(workout, from: workoutScheme)
        navigationStackPath.append(.workout(workout))
        startedWorkouts += 1
    }
}
