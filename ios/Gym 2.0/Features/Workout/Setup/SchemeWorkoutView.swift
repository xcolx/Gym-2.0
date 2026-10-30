//
//  SchemeWorkoutView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 19.08.2024.
//

import SwiftUI
import SwiftData

struct SchemeWorkoutView: View {
    
    @State var workoutScheme: WorkoutScheme
    
    @Binding var navigationStackPath: [NavigationDestination]
    
    @State var localName: String = ""
    @State var localExercises: [Exercise] = []
    
    @State var showSaveForTheFutureAlert: Bool = false
    
    @Environment(\.modelContext) var context
    @Environment(UserSettings.self) var userSettings
    
    // A new workout can only be started if none is in progress
    @Query(filter: #Predicate<Workout> { $0.inProgress == true }) private var workoutsInProgress: [Workout]
    @State private var showsWorkoutInProgress = false
        
    var body: some View {
        
        EditWorkoutView(navStackTitle: workoutScheme.name, workoutTitle: $localName, exerciseList: $localExercises)
        
            HStack{
                Spacer()
                
                Button(action: {
                    guard workoutsInProgress.isEmpty else {
                        showsWorkoutInProgress = true
                        return
                    }
                    
                    let sortedExercisesWithIndex = workoutScheme.exercises.sorted { $0.index < $1.index }
                    let sortedExercises = sortedExercisesWithIndex.map { $0.exercise }
                    if sortedExercises != localExercises || workoutScheme.name != localName{
                        showSaveForTheFutureAlert.toggle()
                    }
                    
                    let workout = Workout.create(name: localName, exercises: localExercises, bodyWeight: userSettings.bodyweight ?? 0)
                    WorkoutSchemeRepository(context: context).startWorkout(workout, from: workoutScheme)
                    navigationStackPath.append(.workout(workout))
                    
                    
                }, label: {
                    Text("Start Workout")
                        .foregroundStyle(Color("MyWhite"))
                        .font(.title)
                        .padding(15)
                        .background(
                            RoundedRectangle(cornerRadius: 25)
                                .tint(Color("MyBlack"))
                        )
                })
                
                
                Spacer()
            }.padding(.bottom, 10)
        
            // A local copy of the title and the list, so that the changes aren't saved into the model right away
            .onAppear {
                localName = workoutScheme.name
                
                localExercises = workoutScheme.sortedExercises
            }
            .alert("Do you want to save these changes for future use?", isPresented: $showSaveForTheFutureAlert) {
                Button("Just once", role: .cancel) {}
                Button("Save for future") {
                    WorkoutSchemeRepository(context: context).update(workoutScheme, name: localName, exercises: localExercises)
                }
            } message: {
                Text("If not it's only going to be changed for this time.")
            }
            .inProgressWorkoutChooser(isPresented: $showsWorkoutInProgress, title: "A workout is already in progress", message: "Finish or cancel it before you start a new one.") { workout in
                navigationStackPath = [.workout(workout)]
            }
    }
    
}

