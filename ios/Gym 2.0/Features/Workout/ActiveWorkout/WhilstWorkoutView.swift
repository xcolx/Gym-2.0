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
    
    @State var timer: Timer? = nil
    @State var time: String = ""
    
    @State var showAlert: Bool = false
    @State var showEditSheet: Bool = false

    // The stopwatches of the time fields keep running while the workout is open
    @State var stopwatchStore = StopwatchStore()
    
    @Environment(\.modelContext) var context
    
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
                
                EndWorkoutView(workout: workout, navigationStackPath: $navigationStackPath)
            }
            .tabViewStyle(PageTabViewStyle())
            .environment(stopwatchStore)
            .navigationTitle("Workout")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Text(time).font(.headline).frame(minWidth: 100)
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
            .ignoresSafeArea(.keyboard)
            .navigationBarBackButtonHidden(true)
            
            .onAppear{
                startTimer()
            }
            .onDisappear {
                stopTimer()
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
    
    func formatTimeInterval(interval: TimeInterval) -> String {
        let seconds = Int(interval) % 60
        let minutes = (Int(interval) / 60) % 60
        let hours = Int(interval) / 3600
        return String(format: "%02d:%02d:%02d", hours, minutes, seconds)
    }
    
    func updateTimeInterval(){
        let now = Date()

        let timeInterval = now.timeIntervalSince(workout.date)
        let formattedInterval = formatTimeInterval(interval: timeInterval)
        time = formattedInterval
    }
    
    func startTimer() {
        stopTimer()
        
        timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
            self.updateTimeInterval()
        }
    }
    
    func stopTimer() {
        timer?.invalidate()
        timer = nil
    }
    
}
