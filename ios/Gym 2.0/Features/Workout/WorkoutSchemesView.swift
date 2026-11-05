//
//  WorkoutSchemesView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 14.08.2024.
//

import SwiftUI
import SwiftData

/// The user's own workouts on the workout start screen, each opened to change it before it's started, or started
/// right away with its play button
struct WorkoutSchemesView: View {

    @Binding var navigationStackPath: [NavigationDestination]

    @State private var showEditDialog: Bool = false

    @Query(
        sort: [SortDescriptor(\WorkoutScheme.name, order: .forward)]
    ) private var workoutSchemes: [WorkoutScheme]

    @Query private var muscles: [Muscle]

    @Environment(\.modelContext) private var context
    @Environment(UserSettings.self) private var userSettings

    // A new workout can only be started if none is in progress
    @Query(filter: #Predicate<Workout> { $0.inProgress == true }) private var workoutsInProgress: [Workout]
    @State private var showsWorkoutInProgress = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text("Your workouts")
                    .font(.title3.bold())
                Spacer()
                if !workoutSchemes.isEmpty {
                    Button("Edit") { showEditDialog = true }
                        .font(.subheadline.weight(.medium))
                }
                NavigationLink(value: NavigationDestination.addScheme) {
                    Image(systemName: "plus.circle.fill")
                        .font(.title3)
                }
                .accessibilityLabel("New workout")
                .padding(.leading, 8)
            }
            .padding(.horizontal, 4)

            if workoutSchemes.isEmpty {
                VStack(spacing: 10) {
                    Image(systemName: "list.bullet.rectangle")
                        .font(.largeTitle)
                        .foregroundStyle(userSettings.appColor)
                    Text("No saved workouts yet")
                        .font(.headline)
                    Text("Save the workouts you do often to start them in one tap.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    NavigationLink(value: NavigationDestination.addScheme) {
                        Text("Create a workout")
                            .font(.subheadline.weight(.semibold))
                    }
                    .padding(.top, 4)
                }
                .multilineTextAlignment(.center)
                .padding(24)
                .frame(maxWidth: .infinity)
                .cardBackground()
            } else {
                VStack(spacing: 10) {
                    ForEach(workoutSchemes, id: \.persistentModelID) { scheme in
                        schemeCard(scheme)
                    }
                }
            }
        }
        .confirmationDialog("Edit workout", isPresented: $showEditDialog, titleVisibility: .visible) {
            ForEach(workoutSchemes, id: \.persistentModelID) { scheme in
                Button(scheme.name) {
                    navigationStackPath.append(.editScheme(selectedScheme: scheme))
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Choose the workout you would like to edit")
        }
        .inProgressWorkoutChooser(isPresented: $showsWorkoutInProgress, title: "A workout is already in progress", message: "Finish or cancel it before you start a new one.") { workout in
            navigationStackPath = [.workout(workout)]
        }
    }

    private func schemeCard(_ scheme: WorkoutScheme) -> some View {
        let count = scheme.exercises.count
        let details = [
            count == 1 ? "1 exercise" : "\(count) exercises",
            scheme.lastPerformed.map { "last done \($0.formatted(.relative(presentation: .named)))" },
        ].compactMap { $0 }.joined(separator: " · ")
        let worked = scheme.sortedExercises.musclesWorked(in: muscles)
        return HStack(spacing: 12) {
            Button {
                navigationStackPath.append(.scheme(selectedScheme: scheme))
            } label: {
                HStack(spacing: 12) {
                    HighlightedBodyView(primaryMuscles: worked.primary, secondaryMuscles: worked.secondary)
                        .frame(width: 54, height: 64)
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(scheme.name)
                            .font(.headline)
                            .foregroundStyle(Color.primary)
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)
                        Text(details)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                        if !worked.primary.isEmpty {
                            Text(worked.primary.map(\.name).joined(separator: ", "))
                                .font(.caption)
                                .foregroundStyle(.tertiary)
                                .lineLimit(1)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            Button {
                start(scheme)
            } label: {
                Image(systemName: "play.fill")
                    .font(.subheadline)
                    .foregroundStyle(userSettings.appColorForeground)
                    .frame(width: 40, height: 40)
                    .background(userSettings.appColor, in: Circle())
            }
            .buttonStyle(.plain)
            .disabled(count == 0)
            .accessibilityLabel("Start \(scheme.name)")
        }
        .padding(.horizontal)
        .padding(.vertical, 12)
        .cardBackground()
        .contextMenu {
            Button("Start", systemImage: "play") { start(scheme) }
                .disabled(count == 0)
            Button("Edit", systemImage: "pencil") {
                navigationStackPath.append(.editScheme(selectedScheme: scheme))
            }
        }
    }

    private func start(_ scheme: WorkoutScheme) {
        guard workoutsInProgress.isEmpty else {
            showsWorkoutInProgress = true
            return
        }
        let workout = Workout.create(name: scheme.name, exercises: scheme.sortedExercises, bodyWeight: userSettings.bodyweight ?? 0)
        WorkoutSchemeRepository(context: context).startWorkout(workout, from: scheme)
        navigationStackPath.append(.workout(workout))
    }
}
