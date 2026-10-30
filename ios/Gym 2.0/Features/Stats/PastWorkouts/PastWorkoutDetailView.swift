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
        VStack{
            let musclesTrained = workout.musclesTrained()
            HighlightedBodyView(primaryMuscles: musclesTrained.0, secondaryMuscles: musclesTrained.1)
            
            VStack{
                ForEach(summaryLines(), id: \.title) { line in
                    StatRowView(line.title, line.value)
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 2)
           
            
            VStack{
                List{
                    ForEach(workout.workoutExercises.sorted { $0.index < $1.index }){ workoutExercise in
                        HStack(alignment: .top){
                            HStack{
                                Text(workoutExercise.exercise?.name ?? "")
                                if workoutExercise.exercise?.verified == true{
                                    Image(systemName: "checkmark.circle")
                                        .foregroundStyle(Color.blue)
                                        .accessibilityLabel("Verified")
                                }
                            }
                            
                            Spacer()
                            
                            VStack(alignment: .trailing){
                                ForEach(0..<workoutExercise.entryCount, id: \.self) {set in
                                    Text(workoutExercise.entryDescription(at: set, weightUnit: userSettings.weightUnit, distanceUnit: userSettings.distanceUnit))
                                }
                            }
                        }
                    }
                }
                .scrollIndicators(ScrollIndicatorVisibility.hidden)
                .padding(10)
                .background(
                    RoundedRectangle(cornerRadius: 10)
                        .stroke(lineWidth: 2)
                )
                .padding(10)
                .scrollContentBackground(.hidden)
                .listStyle(PlainListStyle())
            }
            
            .navigationTitle(workout.name)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { toolbarButtons }
            }
            .alert("Are you sure you want to delete this workout?", isPresented: $showDeleteAlert) {
                Button("Delete", role: .destructive) {
                    vm.delete(workout)
                    dismiss()
                }
                Button("Go back", role: .cancel) {}
            } message: {
                Text("If you delete this workout all of the progress you made will be deleted from the statistics as well.")
            }
            .alert("Are you sure you want to continue with this workout?", isPresented: $showContinueAlert) {
                Button("Continue", action: continueWorkout)
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("You can continue with this workout if you accidentally ended it.")
            }
            .alert("Error", isPresented: $showNotContinueAlert) {
                Button("OK", role: .cancel) {}
            } message: {
                Text("You cannot continue a workout if another workout is already in progress.")
            }
            .alert("Error", isPresented: $showNotRepeatAlert) {
                Button("OK", role: .cancel) {}
            } message: {
                Text("You cannot repeat a workout if another workout is already in progress.")
            }
            .fullScreenCover(isPresented: $showSheet, content: {
                EditPastWorkoutView(workout: workout, container: context.container)
            })
            
        }

    }
    
    
    var toolbarButtons: some View{
        HStack{
            Button(action: {
                showContinueAlert = true
            }, label: {
                Image(systemName: "arrow.right.circle")
                    .font(.headline)
                    .foregroundStyle(userSettings.appColor)
                    .accessibilityLabel("Continue workout")
            })
            .padding(.vertical, 10)
            
            Button(action: repeatWorkout, label: {
                Image(systemName: "arrow.counterclockwise.circle")
                    .font(.headline)
                    .foregroundStyle(userSettings.appColor)
                    .accessibilityLabel("Repeat workout")
            })
            .padding(.vertical, 10)
            
            ShareLink(item: getShareText()){
                Image(systemName: "square.and.arrow.up")
                    .foregroundStyle(userSettings.appColor)
                    .font(.headline)
                    .accessibilityLabel("Share workout")
            }
            
            Button(action: {
                showSheet.toggle()
            }, label: {
                Image(systemName: "pencil")
                    .font(.headline)
                    .foregroundStyle(userSettings.appColor)
                    .accessibilityLabel("Edit workout")
            })
            .padding(.vertical, 10)
            
            Button(action: {
                showDeleteAlert = true
            }, label: {
                Image(systemName: "trash")
                    .font(.headline)
                    .foregroundStyle(.red)
                    .accessibilityLabel("Delete workout")
            })
            .padding(10)
        }
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
            ("Time Trained", StatsSummary.formatDuration(minutes: summary.duration)),
            ("Sets", "\(summary.sets)")
        ]
        if summary.reps.isTracked {
            lines.append(("Reps", "\(Int(summary.reps.total))"))
        }
        if workout.workoutExercises.contains(where: { $0.reps != nil && $0.weights != nil }) {
            lines.append(("Volume", userSettings.weightUnit.formatVolume(kilograms: summary.volume)))
        }
        if summary.time.isTracked {
            lines.append(("Exercise Time", StatsSummary.formatTime(seconds: summary.time.total)))
        }
        if summary.intensity.isTracked {
            lines.append(("Avg Intensity", summary.intensity.average.map(StatsSummary.formatIntensity) ?? "–"))
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


