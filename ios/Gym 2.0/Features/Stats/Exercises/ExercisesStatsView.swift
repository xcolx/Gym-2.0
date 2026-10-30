//
//  ExercisesStatsView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 27.08.2024.
//

import SwiftUI
import SwiftData

struct ExercisesStatsView: View {
    
    @Query() var exercises: [Exercise]
    
    @Query(
        filter: #Predicate <Workout> {$0.inProgress == false}
    ) var workouts: [Workout]
    
    @State var searchText = ""
    
    var filteredExercises: [Exercise]{
        var filteredExercises: [Exercise] = []
        workouts.forEach{ workout in
            workout.workoutExercises.forEach{ workoutExercise in
                if let exercise = workoutExercise.exercise, !filteredExercises.contains(exercise){
                    filteredExercises.append(exercise)
                }
            }
        }
        filteredExercises = filteredExercises.sorted { $0.name < $1.name }
        // Same fuzzy search as the exercise list, best match first
        if searchText.isEmpty == false{
            filteredExercises = FuzzySearch.filter(filteredExercises, query: searchText) { $0.searchNames }
        }
        return filteredExercises
    }
    
    
    var body: some View {
        VStack{
            List(){
                Section("Number of Exercises: \(filteredExercises.count)"){
                    ForEach(filteredExercises) { exercise in
                        NavigationLink(value: StatsRoute.exercise(exercise), label: {
                            HStack{
                                Text(exercise.name)
                                if exercise.verified{
                                    Image(systemName: "checkmark.circle")
                                        .foregroundStyle(Color.blue)
                                        .accessibilityLabel("Verified")
                                }
                            }
                        })
                        
                    }
                }
            }
            .scrollContentBackground(.hidden)
    
            
        }
        .navigationTitle("Stats by Exercise")
        .searchable(text: $searchText)
        .overlay{
            if filteredExercises.isEmpty && !searchText.isEmpty {
                ContentUnavailableView.search
            }
        }
        
        
    }
}

