//
//  PastWorkoutDetailView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 21.08.2024.
//

import SwiftData
import SwiftUI

struct PastWorkoutDetailView: View {

    let workout: Workout

    @Binding var tabSelection: String
    @Binding var workoutNavigationStackPath: [NavigationDestination]

    @Environment(\.modelContext) private var context

    var body: some View {
        PastWorkoutDetailContentView(
            vm: PastWorkoutDetailViewModel(workouts: WorkoutRepository(context: context)),
            workout: workout,
            tabSelection: $tabSelection,
            workoutNavigationStackPath: $workoutNavigationStackPath
        )
    }
}

private struct PastWorkoutDetailContentView: View {

    @State private var vm: PastWorkoutDetailViewModel
    @State var workout: Workout

    @State var showDeleteAlert: Bool = false
    @State var showContinueAlert: Bool = false
    @State var showNotContinueAlert: Bool = false
    @State var showNotRepeatAlert: Bool = false

    @State var showSheet: Bool = false

    @Environment(\.modelContext) var context
    @Environment(\.dismiss) private var dismiss
    @Environment(UserSettings.self) var userSettings

    @Binding var tabSelection: String
    @Binding var workoutNavigationStackPath: [NavigationDestination]

    // The view model is created once, later ones of the parent's body are discarded
    init(vm: PastWorkoutDetailViewModel, workout: Workout, tabSelection: Binding<String>, workoutNavigationStackPath: Binding<[NavigationDestination]>) {
        _vm = State(initialValue: vm)
        _workout = State(initialValue: workout)
        _tabSelection = tabSelection
        _workoutNavigationStackPath = workoutNavigationStackPath
    }

    var body: some View {
        let musclesTrained = workout.musclesTrained()
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(workout.date.formatted(.dateTime.weekday(.wide).day().month(.wide).year().hour().minute()))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 4)

                // The body with the totals of the workout next to it
                HStack(alignment: .center, spacing: 16) {
                    HighlightedBodyView(primaryMuscles: musclesTrained.0, secondaryMuscles: musclesTrained.1)
                        .frame(width: 130)
                    LazyVGrid(columns: [GridItem(.flexible(), alignment: .leading), GridItem(.flexible(), alignment: .leading)], alignment: .leading, spacing: 14) {
                        ForEach(summaryLines().filter { $0.title != "Date" }, id: \.title) { line in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(line.title)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(1)
                                Text(line.value)
                                    .font(.headline)
                                    .fontDesign(.rounded)
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.6)
                            }
                            .accessibilityElement(children: .combine)
                        }
                    }
                }
                .padding()
                .frame(maxWidth: .infinity, alignment: .leading)
                .cardBackground()

                ForEach(workout.workoutExercises.sorted { $0.index < $1.index }){ workoutExercise in
                    VStack(alignment: .leading, spacing: 8) {
                        ExerciseNameText(name: workoutExercise.exercise?.name ?? "", verified: workoutExercise.exercise?.verified == true)
                            .font(.headline)
                        Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 4) {
                            ForEach(0..<workoutExercise.entryCount, id: \.self) {set in
                                GridRow {
                                    Text("\(set + 1)")
                                        .foregroundStyle(.secondary)
                                        .monospacedDigit()
                                        .gridColumnAlignment(.trailing)
                                    Text(workoutExercise.entryDescription(at: set, weightUnit: userSettings.weightUnit, distanceUnit: userSettings.distanceUnit))
                                }
                            }
                        }
                        .font(.subheadline)
                    }
                    .padding()
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .cardBackground()
                }
            }
            .padding()
        }
        .background(Color(.systemGroupedBackground))
        .safeAreaInset(edge: .bottom) {
            Button(action: repeatWorkout) {
                Label("Repeat workout", systemImage: "arrow.counterclockwise")
                    .font(.headline)
                    .foregroundStyle(userSettings.appColorForeground)
                    .frame(maxWidth: .infinity, minHeight: 50)
                    .background(userSettings.appColor, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            .padding(.horizontal)
            .padding(.vertical, 8)
        }
        .navigationTitle(workout.name)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                ShareLink(item: getShareText()){
                    Label("Share workout", systemImage: "square.and.arrow.up")
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button("Continue workout", systemImage: "play") {
                        showContinueAlert = true
                    }
                    Button("Edit workout", systemImage: "pencil") {
                        showSheet = true
                    }
                    Divider()
                    Button(role: .destructive) {
                        showDeleteAlert = true
                    } label: {
                        // The menu would draw the icon in the app color, like the others
                        Label {
                            Text("Delete workout")
                        } icon: {
                            Image(uiImage: UIImage(systemName: "trash")!.withTintColor(.systemRed, renderingMode: .alwaysOriginal))
                        }
                    }
                } label: {
                    Label("More", systemImage: "ellipsis")
                }
            }
        }
        .alert("Delete this workout?", isPresented: $showDeleteAlert) {
            Button("Delete", role: .destructive) {
                vm.delete(workout)
                dismiss()
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("If you delete this workout all of the progress you made will be deleted from the statistics as well.")
        }
        .alert("Continue this workout?", isPresented: $showContinueAlert) {
            Button("Continue", action: continueWorkout)
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("You can continue with this workout if you accidentally ended it.")
        }
        .alert("Can't continue this workout", isPresented: $showNotContinueAlert) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("You cannot continue a workout if another workout is already in progress.")
        }
        .alert("Can't repeat this workout", isPresented: $showNotRepeatAlert) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("You cannot repeat a workout if another workout is already in progress.")
        }
        .fullScreenCover(isPresented: $showSheet, content: {
            EditPastWorkoutView(workout: workout, container: context.container)
        })
    }
    
    func continueWorkout() {
        if vm.continueWorkout(workout) {
            tabSelection = "Workout"
            workoutNavigationStackPath = [.workout(workout)]
            dismiss()
        } else {
            // after the continue alert is gone
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                showNotContinueAlert = true
            }
        }
    }
    
    // Opens the free workout with the same name and exercises in the workout tab, where it can still be changed
    func repeatWorkout() {
        guard let exercises = vm.exercisesToRepeat(workout) else {
            showNotRepeatAlert = true
            return
        }
        tabSelection = "Workout"
        workoutNavigationStackPath = [.repeatedWorkout(name: workout.name, exercises: exercises)]
        dismiss()
    }
    
    // Time and sets, and the metrics tracked by at least one of the exercises of the workout
    func summaryLines() -> [(title: String, value: String)] {
        let summary = StatsCalculator.summary(of: [workout])
        var lines: [(title: String, value: String)] = [
            ("Date", formatDate(date: workout.date)),
            ("Time trained", StatsSummary.formatDuration(minutes: summary.duration)),
            ("Sets", "\(summary.sets)")
        ]
        if summary.reps.isTracked {
            lines.append(("Reps", "\(Int(summary.reps.total))"))
        }
        if workout.workoutExercises.contains(where: { $0.reps != nil && $0.weights != nil }) {
            lines.append(("Volume", userSettings.weightUnit.formatVolume(kilograms: summary.volume)))
        }
        if summary.time.isTracked {
            lines.append(("Exercise time", StatsSummary.formatTime(seconds: summary.time.total)))
        }
        if summary.intensity.isTracked {
            lines.append(("Avg intensity", summary.intensity.average.map(StatsSummary.formatIntensity) ?? "–"))
        }
        if summary.distance.isTracked {
            lines.append(("Distance", userSettings.distanceUnit.formatDistance(meters: summary.distance.total)))
        }
        return lines
    }
    
    func getShareText() -> String {
        // "just completed" only fits a workout of the last day
        let isRecent = Date.now.timeIntervalSince(workout.date) < 24 * 60 * 60
        var text = isRecent
            ? "I just completed a workout and tracked it with Gym 2.0! Check it out:"
            : "I tracked a workout with Gym 2.0! Check it out:"
        
        text += "\n\n"
                
        text += "\(workout.name)"
        text += "\n"
        text += summaryLines().map { "\($0.title): \($0.value)" }.joined(separator: "\n")
        
        text += "\n\n"
        
        for workoutExercise in workout.workoutExercises.sorted(by: { $0.index < $1.index }) {
            
            var exerciseDescription = ""
            
            exerciseDescription += "💪"
            exerciseDescription += workoutExercise.exercise?.name ?? ""
           
            exerciseDescription += "\n"
           
            for setIndex in 0..<workoutExercise.entryCount {
                exerciseDescription += workoutExercise.entryDescription(at: setIndex, weightUnit: userSettings.weightUnit, distanceUnit: userSettings.distanceUnit) + "\n"
            }
           
           text += exerciseDescription + "\n"
        }
        
        return text
    }
    
}


