//
//  PerformingExerciseView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 16.08.2024.
//

import SwiftUI
import SwiftData

struct PerformingExerciseView: View {
    
    @State var workoutExercise: WorkoutExercise
    
    @Binding var navigationStackPath: [NavigationDestination]
    @Environment(UserSettings.self) var userSettings

    @State var filteredPastWorkoutExercises: [WorkoutExercise] = []
    
    @Query(
        filter: #Predicate <WorkoutExercise> {$0.workout?.inProgress == false} ,
        sort: [SortDescriptor(\WorkoutExercise.workout?.date, order: .reverse)]
    ) var pastWorkoutExercises: [WorkoutExercise]
        
    var body: some View {
        if navigationStackPath != []{
            VStack{
                HStack{
                    if let exercise = workoutExercise.exercise {
                        // The exercise can't be added again from the performing workout
                        NavigationLink(value: NavigationDestination.exercise(exercise)) {
                            title
                        }
                        .buttonStyle(.plain)
                    } else {
                        title
                    }
                    Spacer()
                }
                
                EditWorkoutExerciseView(workoutExercise: workoutExercise)
                
                
                VStack(alignment: .center){
                    Text("History:")
                        .padding(.leading, 10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    List{
                        if filteredPastWorkoutExercises.count == 0{
                            Text("You have never done this exercise. You will see your past workouts with this exercise here.")
                        } else {
                            ForEach(filteredPastWorkoutExercises){ workoutExercise in
                                HStack(alignment: .top){
                                    Text(formatDate(date: workoutExercise.workout?.date ?? .now))
                                    Spacer()
                                    Text(workoutExercise.workout?.name ?? "")
                                    Spacer()
                                    VStack(alignment: .trailing){
                                        ForEach(0..<workoutExercise.entryCount, id: \.self) {set in
                                            Text(workoutExercise.entryDescription(at: set, weightUnit: userSettings.weightUnit, distanceUnit: userSettings.distanceUnit))
                                        }
                                    }
                                }
                            }
                        }
                    }
                    .scrollIndicators(ScrollIndicatorVisibility.hidden)
                    .padding(.vertical, 10)
                    .padding(.horizontal, 2)
                    .background(
                        RoundedRectangle(cornerRadius: 10)
                            .stroke(lineWidth: 2)
                    )
                    .padding(.horizontal, 10)
                    .padding(.bottom, 10)
                    .scrollContentBackground(.hidden)
                    .listStyle(PlainListStyle())
                }
                .ignoresSafeArea(.keyboard)
                
            }
            .onAppear{
                // Computed once: as a computed property, cancelling updates the view again for a workout that doesn't
                // exist anymore
                self.filteredPastWorkoutExercises = pastWorkoutExercises.compactMap { pastWorkoutExercise in
                    if pastWorkoutExercise.exercise == workoutExercise.exercise {
                        return pastWorkoutExercise
                    } else {
                        return nil
                    }
                }
            }
        }
    }

    var title: some View {
        HStack{
            Text(workoutExercise.exercise?.name ?? "")
                .font(.headline)
                .padding(.leading, 10)
                .frame(alignment: .leading)
            if workoutExercise.exercise?.verified == true{
                Image(systemName: "checkmark.circle")
                    .foregroundStyle(Color.blue)
                    .accessibilityLabel("Verified")
            }
        }
    }
    
}
