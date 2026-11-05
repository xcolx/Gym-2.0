//
//  PerformingExerciseView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 16.08.2024.
//

import SwiftUI
import SwiftData

/// An exercise of the workout in progress: a slim title, the set table and the past times the exercise was done
struct PerformingExerciseView: View {

    @State var workoutExercise: WorkoutExercise
    /// The position of the exercise in the workout, from 1
    let number: Int
    let exerciseCount: Int

    @Binding var navigationStackPath: [NavigationDestination]
    @Environment(UserSettings.self) var userSettings

    @State var filteredPastWorkoutExercises: [WorkoutExercise] = []
    @State private var record: ExerciseHistoryCard.RecordSet?

    // Sorted in onAppear: a SortDescriptor through the optional relationship (\WorkoutExercise.workout?.date)
    // crashes in release builds, SwiftData can't find the optimized key path
    @Query(
        filter: #Predicate <WorkoutExercise> {$0.workout?.inProgress == false}
    ) var pastWorkoutExercises: [WorkoutExercise]

    var body: some View {
        if navigationStackPath != [] {
            // Not one scroll view: the sets stay in place however long the history is, it scrolls on its own
            VStack(alignment: .leading, spacing: 12) {
                title

                EditWorkoutExerciseView(workoutExercise: workoutExercise)
                    .padding()
                    .cardBackground()

                history
                    .padding(.top, 8)
            }
            .padding(.horizontal)
            .padding(.bottom, 8)
            .onAppear {
                // Computed once: as a computed property, cancelling updates the view again for a workout that doesn't
                // exist anymore
                filteredPastWorkoutExercises = pastWorkoutExercises
                    .filter { $0.exercise == workoutExercise.exercise }
                    .sorted { ($0.workout?.date ?? .distantPast) > ($1.workout?.date ?? .distantPast) }
                if let exercise = workoutExercise.exercise {
                    record = ExerciseHistoryCard.recordSet(of: exercise, in: filteredPastWorkoutExercises, summary: StatsCalculator.summary(of: filteredPastWorkoutExercises))
                }
            }
        }
    }

    /// One slim line, so that the sets get the space
    private var title: some View {
        HStack(spacing: 10) {
            Text("\(number)/\(exerciseCount)")
                .font(.caption.weight(.bold))
                .monospacedDigit()
                .foregroundStyle(userSettings.appColor)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(userSettings.appColor.opacity(0.15), in: Capsule())
                .accessibilityLabel("Exercise \(number) of \(exerciseCount)")
            ExerciseNameText(name: workoutExercise.exercise?.name ?? "", verified: workoutExercise.exercise?.verified ?? false)
                .font(.headline)
                .lineLimit(1)
            Spacer(minLength: 4)
            if let exercise = workoutExercise.exercise {
                // The exercise can't be added again from the performing workout
                NavigationLink(value: NavigationDestination.exercise(exercise)) {
                    Image(systemName: "info.circle")
                        .font(.title3)
                        .foregroundStyle(userSettings.appColor)
                }
                .accessibilityLabel("Details of \(exercise.name)")
            }
        }
        .padding(.horizontal, 4)
        .padding(.top, 4)
    }

    private var history: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("History")
                .font(.title3.bold())
                .padding(.horizontal, 4)
            if filteredPastWorkoutExercises.isEmpty {
                Text("You have never done this exercise. You will see your past workouts with this exercise here.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .padding()
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .cardBackground()
                Spacer(minLength: 0)
            } else {
                ExerciseHistoryCard(workoutExercises: filteredPastWorkoutExercises, record: record, scrolls: true)
                    .scrollDismissesKeyboard(.interactively)
            }
        }
        .frame(maxHeight: .infinity, alignment: .top)
    }
}
