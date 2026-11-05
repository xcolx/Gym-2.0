//
//  WorkoutView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 14.08.24.
//

import SwiftUI


enum NavigationDestination: Hashable {
    case freeWorkout
    // the free workout prefilled with the name and exercises of a past workout, to do it again
    case repeatedWorkout(name: String, exercises: [Exercise])
    case suggestedWorkoutSettings
    // the picked exercises, and the settings to pick others with
    case suggestedWorkout(settings: WorkoutSuggestion.Settings, exerciseList: [Exercise])
    case addScheme
    case editScheme(selectedScheme: WorkoutScheme)
    // the workout in progress to show
    case workout(Workout)
    case scheme(selectedScheme: WorkoutScheme)
    // the details of an exercise of the workout in progress, without the button that adds it
    case exercise(Exercise)
}

/// The start of a workout: a free or a suggested one, or one of the user's own workouts
struct WorkoutView: View {

    @Binding var navigationStackPath: [NavigationDestination]

    var body: some View {
        NavigationStack(path: $navigationStackPath) {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    HStack(spacing: 12) {
                        NavigationLink(value: NavigationDestination.freeWorkout) {
                            StartCard(title: "Free workout", subtitle: "Pick your exercises", systemImage: "plus")
                        }
                        NavigationLink(value: NavigationDestination.suggestedWorkoutSettings) {
                            StartCard(title: "Suggested", subtitle: "Based on your week", systemImage: "sparkles")
                        }
                    }
                    .buttonStyle(.plain)

                    WorkoutSchemesView(navigationStackPath: $navigationStackPath)
                }
                .padding(.horizontal)
                .padding(.bottom)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Workout")
            .navigationDestination(for: NavigationDestination.self) { destination in
                switch destination {
                case .freeWorkout:
                    FreeWorkoutView(navigationStackPath: $navigationStackPath)
                case .repeatedWorkout(let name, let exercises):
                    FreeWorkoutView(navigationStackPath: $navigationStackPath, workoutTitle: name, exerciseList: exercises)
                case .suggestedWorkoutSettings:
                    SuggestedWorkoutSettingsView(navigationStackPath: $navigationStackPath)
                case .suggestedWorkout(let settings, let exerciseList):
                    SuggestedWorkoutView(navigationStackPath: $navigationStackPath, settings: settings, exerciseList: exerciseList)
                case .addScheme:
                    AddSchemeWorkoutView()
                case .editScheme(let scheme):
                    EditSchemeWorkoutView(navigationStackPath: $navigationStackPath, workoutScheme: scheme)
                case .workout(let workout):
                    WhilstWorkoutView(workout: workout, navigationStackPath: $navigationStackPath)
                case .scheme(let scheme):
                    SchemeWorkoutView(workoutScheme: scheme, navigationStackPath: $navigationStackPath)
                case .exercise(let exercise):
                    ExerciseDetailView(exercise: exercise)
                }
            }
            
            
        }
        .ignoresSafeArea(.keyboard)
    }
}

/// One of the two ways to start a workout without a saved one
private struct StartCard: View {

    let title: String
    let subtitle: String
    let systemImage: String

    @Environment(UserSettings.self) private var userSettings

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Image(systemName: systemImage)
                .font(.title3.weight(.semibold))
                .foregroundStyle(userSettings.appColorForeground)
                .frame(width: 44, height: 44)
                .background(userSettings.appColor, in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.headline)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Text(subtitle)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardBackground()
        .contentShape(Rectangle())
    }
}
