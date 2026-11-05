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

    private var sortedExercises: [WorkoutExercise] {
        model.workout.workoutExercises.sorted { $0.index < $1.index }
    }

    /// The sets with a value
    private func doneSets(of workoutExercise: WorkoutExercise) -> Int {
        let sides = workoutExercise.unilateral ? 2 : 1
        let entries = (0..<workoutExercise.entryCount).filter { !workoutExercise.isEntryEmpty(at: $0, bodyWeight: bodyWeight) }
        return workoutExercise.unilateral ? Set(entries.map { $0 / sides }).count : entries.count
    }

    var body: some View {
        @Bindable var model = model
        let exercises = sortedExercises
        let doneCounts = exercises.map(doneSets)
        let doneExercises = doneCounts.filter { $0 > 0 }.count
        // only the exercises with sets, and a muscle once: trained if any of them trains it as primary muscle
        let exercisesWithSets = zip(exercises, doneCounts).filter { $0.1 > 0 }.compactMap { $0.0.exercise }
        let primary = exercisesWithSets.flatMap(\.primaryMuscles).uniqued()
        let trained = (primary, exercisesWithSets.flatMap(\.secondaryMuscles).uniqued().filter { !primary.contains($0) })
        ScrollView {
            VStack(spacing: 16) {
                VStack(spacing: 4) {
                    Text(doneExercises == 0 ? "Ready to finish?" : "Nice work")
                        .font(.title.bold())
                    Text("\(doneExercises) of \(exercises.count) \(exercises.count == 1 ? "exercise has" : "exercises have") sets")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .padding(.top, 8)

                HStack(spacing: 10) {
                    TimelineView(.periodic(from: model.workout.date, by: 60)) { context in
                        SummaryTile(value: StatsSummary.formatDuration(minutes: max(0, Int(context.date.timeIntervalSince(model.workout.date) / 60))), label: "Time")
                    }
                    SummaryTile(value: "\(doneCounts.reduce(0, +))", label: "Sets")
                    SummaryTile(value: userSettings.weightUnit.formatVolume(kilograms: exercises.reduce(0) { $0 + $1.volume }), label: "Volume")
                }

                HStack(spacing: 16) {
                    HighlightedBodyView(primaryMuscles: trained.0, secondaryMuscles: trained.1)
                        .frame(height: 170)
                    VStack(alignment: .leading, spacing: 12) {
                        MuscleLegend(color: MuscleLegend.primaryColor, title: "Trained", muscles: trained.0)
                        if !trained.1.isEmpty {
                            MuscleLegend(color: MuscleLegend.secondaryColor, title: "A bit", muscles: trained.1)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding()
                .cardBackground()

                VStack(spacing: 0) {
                    ForEach(Array(zip(exercises, doneCounts).enumerated()), id: \.element.0.persistentModelID) { index, item in
                        let (workoutExercise, done) = item
                        HStack(spacing: 10) {
                            Image(systemName: done > 0 ? "checkmark.circle.fill" : "circle")
                                .foregroundStyle(done > 0 ? userSettings.appColor : Color(.tertiaryLabel))
                            Text(workoutExercise.exercise?.name ?? "")
                                .foregroundStyle(done > 0 ? Color.primary : Color.secondary)
                                .lineLimit(1)
                            Spacer()
                            Text(done == 0 ? "Empty" : done == 1 ? "1 set" : "\(done) sets")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                        .padding(.horizontal)
                        .padding(.vertical, 11)
                        if index < exercises.count - 1 {
                            Divider().padding(.leading, 44)
                        }
                    }
                }
                .cardBackground()
            }
            .padding(.horizontal)
            .padding(.bottom, 40)
        }
        .bottomActionBar {
            Button {
                showExercisesView.toggle()
            } label: {
                Image(systemName: "plus")
                    .font(.headline)
                    .foregroundStyle(userSettings.appColor)
                    .frame(width: 52, height: 52)
                    .background(userSettings.appColor.opacity(0.15), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            .accessibilityLabel("Add exercise")
            Button {
                if let outcome = model.requestEnd(bodyWeight: bodyWeight) {
                    leave(after: outcome)
                }
            } label: {
                Label("Finish workout", systemImage: "flag.checkered")
            }
            .buttonStyle(PrimaryButtonStyle())
        }
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
    }

    /// Leaves the workout, celebrating it if it was saved
    private func leave(after outcome: EndWorkoutViewModel.Outcome) {
        navigationStackPath = []
        if case .ended(let duration) = outcome {
            celebrateWorkout(duration)
        }
    }
}

/// One of the totals of the finish page
private struct SummaryTile: View {

    let value: String
    let label: String

    var body: some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.headline)
                .fontDesign(.rounded)
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity)
        .cardBackground()
        .accessibilityElement(children: .combine)
    }
}

private extension Array where Element == Muscle {
    /// In the order of their first appearance
    func uniqued() -> [Muscle] {
        var seen = Set<Muscle>()
        return filter { seen.insert($0).inserted }
    }
}
