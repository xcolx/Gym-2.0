//
//  EditWorkoutView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 15.08.2024.
//

import SwiftUI
import SwiftData

/// The name and the exercises of a workout before it's started or saved, with its main buttons at the bottom. The
/// exercises are reordered by dragging them and removed by swiping.
struct EditWorkoutView<Actions: View>: View {

    let navStackTitle: String
    @Binding var workoutTitle: String
    @Binding var exerciseList: [Exercise]
    /// The buttons at the bottom, e.g. "Start workout"
    @ViewBuilder let actions: () -> Actions

    @State private var showExercisesView: Bool = false
    /// The exercise whose muscles are shown on the body instead of the ones of the whole workout
    @State private var selectedIndex: Int?

    @Environment(UserSettings.self) private var userSettings

    @Query(sort: \Muscle.name) private var muscles: [Muscle]

    var body: some View {
        let muscleNames = Dictionary(muscles.map { ($0.serverId, $0.name) }, uniquingKeysWith: { first, _ in first })
        List {
            Section {
                TextField("Workout name", text: $workoutTitle)
                    .font(.title3.weight(.semibold))
                    .autocorrectionDisabled()
                    .submitLabel(.done)
                    .onChange(of: workoutTitle) {
                        if workoutTitle.count > Workout.maxNameLength {
                            workoutTitle = String(workoutTitle.prefix(Workout.maxNameLength))
                        }
                    }
            } header: {
                Text("Name")
            }

            if !exerciseList.isEmpty {
                Section {
                    musclesWorked
                } header: {
                    Text("Muscles worked")
                }
            }

            Section {
                if exerciseList.isEmpty {
                    VStack(spacing: 8) {
                        Image(systemName: "dumbbell")
                            .font(.largeTitle)
                            .foregroundStyle(userSettings.appColor)
                        Text("No exercises yet")
                            .font(.headline)
                        Text("Add the exercises you want to do.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                }
                // by position, an exercise can be in the list more than once
                ForEach(Array(exerciseList.enumerated()), id: \.offset) { index, exercise in
                    // a tap gesture, not a button, so that the row can still be dragged
                    ExerciseRow(number: index + 1, exercise: exercise, muscles: exercise.primaryMuscleIds.compactMap { muscleNames[$0] }, isSelected: selectedIndex == index)
                        .onTapGesture { select(index) }
                        .accessibilityAction { select(index) }
                    .listRowBackground(selectedIndex == index ? userSettings.appColor.opacity(0.12) : Color(.secondarySystemGroupedBackground))
                }
                .onDelete { exerciseList.remove(atOffsets: $0) }
                .onMove { exerciseList.move(fromOffsets: $0, toOffset: $1) }

                Button {
                    showExercisesView = true
                } label: {
                    Label("Add exercises", systemImage: "plus.circle.fill")
                        .font(.body.weight(.medium))
                }
            } header: {
                Text(exerciseList.isEmpty ? "Exercises" : exerciseList.count == 1 ? "1 exercise" : "\(exerciseList.count) exercises")
            } footer: {
                if exerciseList.count > 1 {
                    Text("Hold and drag an exercise to move it, swipe to remove it.")
                }
            }
        }
        .navigationTitle(navStackTitle)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showExercisesView = true
                } label: {
                    Image(systemName: "plus")
                }
                .accessibilityLabel("Add exercises")
            }
        }
        // the positions changed
        .onChange(of: exerciseList) { selectedIndex = nil }
        .bottomActionBar(actions)
        .sheet(isPresented: $showExercisesView) {
            ExercisesView(showExercisesView: $showExercisesView, exerciseList: $exerciseList)
        }
    }

    private func select(_ index: Int) {
        withAnimation(.snappy(duration: 0.2)) {
            selectedIndex = selectedIndex == index ? nil : index
        }
    }

    /// The body with the muscles of the whole workout, or of the selected exercise
    private var musclesWorked: some View {
        let selected = selectedIndex.flatMap { exerciseList.indices.contains($0) ? exerciseList[$0] : nil }
        let worked = (selected.map { [$0] } ?? exerciseList).musclesWorked(in: muscles)
        return HStack(alignment: .center, spacing: 16) {
            HighlightedBodyView(primaryMuscles: worked.primary, secondaryMuscles: worked.secondary)
                .frame(height: 170)
                .animation(.easeInOut(duration: 0.25), value: selectedIndex)
            VStack(alignment: .leading, spacing: 10) {
                Group {
                    if let selected {
                        ExerciseNameText(name: selected.name, verified: selected.verified)
                    } else {
                        Text("Whole workout")
                    }
                }
                .font(.headline)
                .lineLimit(2)
                MuscleLegend(color: MuscleLegend.primaryColor, title: "Main", muscles: worked.primary)
                if !worked.secondary.isEmpty {
                    MuscleLegend(color: MuscleLegend.secondaryColor, title: "Also", muscles: worked.secondary)
                }
                Text(selected == nil ? "Tap an exercise to see only its muscles." : "Tap it again to see the whole workout.")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, 6)
    }
}

/// An exercise of the workout with its position and main muscles
private struct ExerciseRow: View {

    let number: Int
    let exercise: Exercise
    let muscles: [String]
    var isSelected = false

    @Environment(UserSettings.self) private var userSettings

    var body: some View {
        HStack(spacing: 12) {
            Text("\(number)")
                .font(.subheadline.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(isSelected ? userSettings.appColorForeground : userSettings.appColor)
                .frame(width: 30, height: 30)
                .background(isSelected ? userSettings.appColor : userSettings.appColor.opacity(0.15), in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                ExerciseNameText(name: exercise.name, verified: exercise.verified)
                    .font(.body.weight(.medium))
                if !muscles.isEmpty {
                    Text(muscles.joined(separator: ", "))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            Image(systemName: "line.3.horizontal")
                .foregroundStyle(.tertiary)
                .accessibilityHidden(true)
        }
        .padding(.vertical, 2)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}
