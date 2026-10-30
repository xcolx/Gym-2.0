//
//  WorkoutView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 14.08.24.
//

import SwiftUI


enum NavigationDestination: Hashable {
    case freeWorkout
    // the free workout prefilled with the name and exercises of a past workout, to do it again
    case repeatedWorkout(name: String, exercises: [Exercise])
    case suggestedWorkoutSettings
    case suggestedWorkout(exerciseList: [Exercise])
    case addScheme
    case editScheme(selectedScheme: WorkoutScheme)
    // the workout in progress to show
    case workout(Workout)
    case scheme(selectedScheme: WorkoutScheme)
    // the details of an exercise of the workout in progress, without the button that adds it
    case exercise(Exercise)
}

struct WorkoutView: View {
    
    @Binding var navigationStackPath: [NavigationDestination]
    
    var body: some View {
        
        NavigationStack(path: $navigationStackPath){
            
            VStack(alignment: .leading){
                
                NavigationLink(value: NavigationDestination.freeWorkout){
                    Text("Free Workout")
                        .foregroundStyle(Color("MyWhite"))
                        .font(.title)
                        .padding(15)
                        .background(
                            RoundedRectangle(cornerRadius: 25)
                                .tint(Color("MyBlack"))
                        )
                }
                
                
                NavigationLink(value: NavigationDestination.suggestedWorkoutSettings){
                    Text("Suggested Workout")
                        .foregroundStyle(Color("MyWhite"))
                        .font(.title)
                        .padding(15)
                        .background(
                            RoundedRectangle(cornerRadius: 25)
                                .tint(Color("MyBlack"))
                        )
                }
                
                WorkoutSchemesView(navigationStackPath: $navigationStackPath)
                    .padding(.top, 10)
                Spacer()
                
            }
            
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .navigationTitle("Workout")
            .navigationBarTitleDisplayMode(.automatic)
            .navigationDestination(for: NavigationDestination.self) { destination in
                switch destination {
                case .freeWorkout:
                    FreeWorkoutView(navigationStackPath: $navigationStackPath)
                case .repeatedWorkout(let name, let exercises):
                    FreeWorkoutView(navigationStackPath: $navigationStackPath, workoutTitle: name, exerciseList: exercises)
                case .suggestedWorkoutSettings:
                    SuggestedWorkoutSettingsView(navigationStackPath: $navigationStackPath)
                case .suggestedWorkout(let exerciseList):
                    SuggestedWorkoutView(navigationStackPath: $navigationStackPath, exerciseList: exerciseList)
                case .addScheme:
                    AddSchemeWorkoutView()
                case .editScheme(let scheme):
                    EditSchemeWorkoutView(navigationStackPath: $navigationStackPath, workoutScheme: scheme)
                case .workout(let workout):
                    WhilstWorkoutView(workout: workout, navigationStackPath: $navigationStackPath)
                case .scheme(let scheme):
                    SchemeWorkoutView(workoutScheme: scheme, navigationStackPath: $navigationStackPath)
                case .exercise(let exercise):
                    ExerciseDetailView(exercise: exercise, exerciseList: .constant([]), showExercisesView: .constant(false), showAddButton: false)
                }
            }
            
            
        }
        .ignoresSafeArea(.keyboard)
    }
}

