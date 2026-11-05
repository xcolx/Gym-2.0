//
//  WhilstWorkoutView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 16.08.2024.
//

import OSLog
import SwiftUI
import SwiftData

struct WhilstWorkoutView: View {
    
    @Bindable var workout: Workout
    @Binding var navigationStackPath: [NavigationDestination]
    
    @State var asksToDelete: Bool = false
    @State var showOverview: Bool = false
    // The sheet of EndWorkoutView is presented here: as a page of the TabView, that view is created anew, e.g. when the
    // swipe to it ends after the tap, which reset its state and closed the sheet again
    @State var showExercisesView: Bool = false
    @State var exercisesToAdd: [Exercise] = []
    /// The index of the exercise shown, the number of exercises for the finish page
    @State private var page: Int = 0

    // The stopwatches of the time fields keep running while the workout is open
    @State var stopwatchStore = StopwatchStore()
    
    @Environment(\.modelContext) var context
    @Environment(UserSettings.self) var userSettings
    
    var body: some View {
        
        // e.g. discarded while it was open, also on another device
        if workout.isDeleted || workout.modelContext == nil {
            Text("This workout doesn't exist anymore.")
                .onAppear{
                    navigationStackPath = []
                }
        }
        else{
            let exercises = workout.workoutExercises.sorted(by: {$0.index < $1.index})
            TabView(selection: $page) {
                ForEach(Array(exercises.enumerated()), id: \.element.persistentModelID) { index, exercise in
                    PerformingExerciseView(workoutExercise: exercise, number: index + 1, exerciseCount: exercises.count, navigationStackPath: $navigationStackPath)
                        .ignoresSafeArea(.keyboard)
                        .tag(index)
                }
                
                EndWorkoutView(workout: workout, navigationStackPath: $navigationStackPath, showExercisesView: $showExercisesView)
                    .tag(exercises.count)
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .background(Color(.systemGroupedBackground))
            .safeAreaInset(edge: .top, spacing: 0) {
                progressBars(exercises)
            }
            .environment(stopwatchStore)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        asksToDelete = true
                    } label: {
                        Image(systemName: "xmark")
                            .font(.body.weight(.semibold))
                            .foregroundStyle(.secondary)
                            .accessibilityLabel("Cancel workout")
                    }
                }
                ToolbarItem(placement: .principal) {
                    VStack(spacing: 0) {
                        Text(workout.name)
                            .font(.headline)
                            .lineLimit(1)
                        WorkoutClock(start: workout.date)
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showOverview = true
                    } label: {
                        Image(systemName: "list.bullet")
                            .font(.body.weight(.semibold))
                            .accessibilityLabel("Workout overview")
                    }
                }
            }
            .deleteWorkoutConfirmation(isPresented: $asksToDelete, onDelete: cancelWorkout)
            .sheet(isPresented: $showOverview) {
                EditPerformingWorkoutView(
                    workout: workout,
                    currentExercise: exercises.indices.contains(page) ? exercises[page] : nil,
                    onSelect: { selected in
                        let sorted = workout.workoutExercises.sorted(by: {$0.index < $1.index})
                        if let index = sorted.firstIndex(of: selected) {
                            page = index
                        }
                    },
                    onDeleteWorkout: cancelWorkout
                )
            }
            .sheet(isPresented: $showExercisesView, onDismiss: {
                workout.addExercises(exercisesToAdd, bodyWeight: userSettings.bodyweight ?? 0)
                exercisesToAdd = []
            }, content: {
                ExercisesView(showExercisesView: $showExercisesView, exerciseList: $exercisesToAdd)
            })
            .ignoresSafeArea(.keyboard)
            .navigationBarBackButtonHidden(true)
            // removed exercises: stay inside the pages
            .onChange(of: exercises.count) {
                page = min(page, exercises.count)
            }
            // finished on another device while it was open here, ending it here clears the path as well
            .onChange(of: workout.inProgress) {
                if !workout.inProgress {
                    WorkoutLastChange.remove(workout.clientUUID)
                    navigationStackPath = []
                }
            }
        }
    }

    /// One bar per exercise: the shown one in the app color, the ones with sets faded, the empty ones grey
    private func progressBars(_ exercises: [WorkoutExercise]) -> some View {
        let bodyWeight = userSettings.bodyweight ?? 0
        return HStack(spacing: 4) {
            ForEach(Array(exercises.enumerated()), id: \.element.persistentModelID) { index, exercise in
                let hasSets = (0..<exercise.entryCount).contains { !exercise.isEntryEmpty(at: $0, bodyWeight: bodyWeight) }
                Button {
                    withAnimation { page = index }
                } label: {
                    Capsule()
                        .fill(index == page ? userSettings.appColor : hasSets ? userSettings.appColor.opacity(0.35) : Color(.systemFill))
                        .frame(height: 4)
                        .frame(maxHeight: .infinity)
                        .contentShape(Rectangle())
                }
            }
            Button {
                withAnimation { page = exercises.count }
            } label: {
                Image(systemName: "flag.checkered")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(page == exercises.count ? userSettings.appColor : Color.secondary)
                    .frame(width: 28, height: 28)
                    .contentShape(Rectangle())
            }
        }
        .buttonStyle(.plain)
        .frame(height: 28)
        .padding(.horizontal)
        .padding(.bottom, 4)
        .animation(.snappy(duration: 0.2), value: page)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(page < exercises.count ? "Exercise \(page + 1) of \(exercises.count)" : "Finish")
    }
    
    func cancelWorkout() {
        WorkoutLastChange.remove(workout.clientUUID)
        do {
            try WorkoutRepository(context: context).delete(workout)
            navigationStackPath = []
        } catch {
            Logger.workout.error("Saving the context after cancelling the workout failed: \(error.localizedDescription, privacy: .public)")
        }
    }
}

/// The time since the start of the workout. Only this view is updated every second, not the pages of the workout.
private struct WorkoutClock: View {

    let start: Date

    var body: some View {
        TimelineView(.periodic(from: start, by: 1)) { context in
            Text(Self.format(context.date.timeIntervalSince(start)))
                .font(.caption.weight(.medium))
                .monospacedDigit()
                .foregroundStyle(.secondary)
        }
    }

    static func format(_ interval: TimeInterval) -> String {
        let seconds = Int(interval) % 60
        let minutes = (Int(interval) / 60) % 60
        let hours = Int(interval) / 3600
        return String(format: "%02d:%02d:%02d", hours, minutes, seconds)
    }
}
