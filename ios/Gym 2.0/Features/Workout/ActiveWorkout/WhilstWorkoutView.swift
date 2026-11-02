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
    
    @State var showAlert: Bool = false
    @State var showEditSheet: Bool = false
    // The sheet of EndWorkoutView is presented here: as a page of the TabView, that view is created anew, e.g. when the
    // swipe to it ends after the tap, which reset its state and closed the sheet again
    @State var showExercisesView: Bool = false
    @State var exercisesToAdd: [Exercise] = []

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
            TabView{ 
                ForEach(workout.workoutExercises.sorted(by: {$0.index < $1.index})){ exercise in
                    PerformingExerciseView(workoutExercise: exercise, navigationStackPath: $navigationStackPath)
                        .ignoresSafeArea(.keyboard)
                        .padding(.horizontal, 10)
                }
                
                EndWorkoutView(workout: workout, navigationStackPath: $navigationStackPath, showExercisesView: $showExercisesView)
            }
            .tabViewStyle(PageTabViewStyle())
            .environment(stopwatchStore)
            .navigationTitle("Workout")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    WorkoutClock(start: workout.date).frame(minWidth: 100)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    toolbarButtons
                }
            }
            .alert("Cancel your workout?", isPresented: $showAlert) {
                Button("Go back", role: .cancel) {}
                Button("Delete", role: .destructive, action: cancelWorkout)
            } message: {
                Text("If you cancel your workout, nothing will be saved.")
            }
            .sheet(isPresented: $showEditSheet) {
                EditPerformingWorkoutView(workout: workout)
            }
            .sheet(isPresented: $showExercisesView, onDismiss: {
                workout.addExercises(exercisesToAdd, bodyWeight: userSettings.bodyweight ?? 0)
                exercisesToAdd = []
            }, content: {
                ExercisesView(showExercisesView: $showExercisesView, exerciseList: $exercisesToAdd)
            })
            .ignoresSafeArea(.keyboard)
            .navigationBarBackButtonHidden(true)
            // finished on another device while it was open here, ending it here clears the path as well
            .onChange(of: workout.inProgress) {
                if !workout.inProgress {
                    WorkoutLastChange.remove(workout.clientUUID)
                    navigationStackPath = []
                }
            }
        }
    }
        
    var toolbarButtons: some View{
        HStack{
            Button(action: {
                showAlert.toggle()
            }, label: {
                Image(systemName: "xmark.circle")
                    .font(.title)
                    .foregroundStyle(Color.red)
                    .accessibilityLabel("Cancel workout")
            })
            
            Button(action: {
                showEditSheet.toggle()
            }, label: {
                Image(systemName: "pencil")
                    .font(.title)
                    .accessibilityLabel("Edit workout")
            })
            
        }
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
                .font(.headline)
        }
    }

    static func format(_ interval: TimeInterval) -> String {
        let seconds = Int(interval) % 60
        let minutes = (Int(interval) / 60) % 60
        let hours = Int(interval) / 3600
        return String(format: "%02d:%02d:%02d", hours, minutes, seconds)
    }
}
