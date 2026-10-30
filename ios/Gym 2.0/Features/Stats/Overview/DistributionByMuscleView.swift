//
//  DistributionByMuscleView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 27.08.2024.
//

import SwiftUI
import SwiftData

enum ValueCriteria: String, CaseIterable, Identifiable{
    case reps = "Reps"
    case sets = "Sets"
    case workouts = "Workouts"
    
    var id: String { rawValue }
}

enum CategoryCriteria: String, CaseIterable, Identifiable{
    case muscle = "Muscle"
    case muscleGroup = "Muscle Group"
    
    var id: String { rawValue }
}

struct DistributionByMuscleView: View {
    
    @State var selectedValueCriteria: ValueCriteria = .sets
    @State var selectedCategoryCriteria: CategoryCriteria = .muscle
    @State var percentages: [Double] = []
    
    @Query(
        filter: #Predicate <Workout> {$0.inProgress == false}
    ) var workouts: [Workout]
    
    @Query(sort: \Muscle.name) var muscles: [Muscle]
    @Query(sort: \MuscleGroup.name) var muscleGroups: [MuscleGroup]
    
    @Environment(UserSettings.self) var userSettings
    
    var body: some View {
        VStack{
            if workouts.count > 0{
                HStack{
                    VStack(spacing: 2){
                        if selectedCategoryCriteria == .muscle{
                            ForEach(muscles){ muscle in
                                Text(muscle.name)
                                    .frame(width: 100, height: 20, alignment: .leading)
                            }
                        } else {
                            ForEach(muscleGroups){ muscleGroup in
                                Text(muscleGroup.name)
                                    .frame(width: 100, height: 20, alignment: .leading)
                            }
                        }
                    }
                    
                    VStack(spacing: 2){
                        ForEach(percentages, id: \.self) { percentage in
                            GeometryReaderBarView(percentage: percentage)
                                .frame(height: 20)
                        }
                    }
                }
                .padding(10)
                
                Spacer()
                
                AppColorSegmentedPicker(options: CategoryCriteria.allCases, selection: $selectedCategoryCriteria) { $0.rawValue }
                    .padding(.horizontal, 10)
                
                AppColorSegmentedPicker(options: ValueCriteria.allCases, selection: $selectedValueCriteria) { $0.rawValue }
                    .padding(.horizontal, 10)
                    .padding(.bottom, 10)
                
            } else {
                Text("You haven't done any workouts yet. After your first workout you will see the muscle distribution here.")
                    .padding(10)
            }
        }
        .navigationTitle("Muscle Distribution")
        .onAppear{
            getPercentages()
        }
        .onChange(of: selectedValueCriteria){
            getPercentages()
        }
        .onChange(of: selectedCategoryCriteria){
            getPercentages()
        }
    }
    
    func getPercentages(){
        if selectedCategoryCriteria == .muscle{
            percentages = Array(repeating: 0.0, count: muscles.count)
        } else {
            percentages = Array(repeating: 0.0, count: muscleGroups.count)
        }
        
        if (selectedValueCriteria == .sets || selectedValueCriteria == .reps) && selectedCategoryCriteria == .muscle{
            var muscleIndex: Int = 0
            var count: Double = 0
            muscles.forEach{ muscle in
                workouts.forEach{ workout in
                    workout.workoutExercises.forEach{ workoutExercise in
                        guard let exercise = workoutExercise.exercise else { return }
                        if exercise.primaryMuscleIds.contains(muscle.serverId){
                            if selectedValueCriteria == .sets{
                                count += Double(workoutExercise.getNumberOfSets())
                            } else {
                                count += Double(workoutExercise.totalReps)
                            }
                        }
                        if exercise.secondaryMuscleIds.contains(muscle.serverId){
                            if selectedValueCriteria == .sets{
                                count += 0.33 * Double(workoutExercise.getNumberOfSets())
                            } else {
                                count += 0.33 * Double(workoutExercise.totalReps)
                            }
                        }
                    }
                }
                percentages[muscleIndex] = count
                muscleIndex += 1
                count = 0
            }
        }
        
        if selectedValueCriteria == .workouts && selectedCategoryCriteria == .muscle{
            var muscleIndex: Int = 0
            var count: Double = 0
            muscles.forEach{ muscle in
                workouts.forEach{ workout in
                    if muscleInWorkout(workout: workout, muscle: muscle){
                        count += 1
                    }
                }
                percentages[muscleIndex] = count
                muscleIndex += 1
                count = 0
            }
        }
        
        if (selectedValueCriteria == .sets || selectedValueCriteria == .reps) && selectedCategoryCriteria == .muscleGroup{
            var muscleIndex: Int = 0
            var count: Double = 0
            muscleGroups.forEach{ muscleGroup in
                workouts.forEach{ workout in
                    workout.workoutExercises.forEach{ workoutExercise in
                        if workoutExercise.exercise?.muscleGroupId == muscleGroup.serverId{
                            if selectedValueCriteria == .sets{
                                count += Double(workoutExercise.getNumberOfSets())
                            } else {
                                count += Double(workoutExercise.totalReps)
                            }
                        }
                    }
                }
                percentages[muscleIndex] = count
                muscleIndex += 1
                count = 0
            }
        }
        
        if selectedValueCriteria == .workouts && selectedCategoryCriteria == .muscleGroup{
            var muscleIndex: Int = 0
            var count: Double = 0
            muscleGroups.forEach{ muscleGroup in
                workouts.forEach{ workout in
                    if muscleGroupInWorkout(workout: workout, muscleGroup: muscleGroup){
                        count += 1
                    }
                }
                percentages[muscleIndex] = count
                muscleIndex += 1
                count = 0
            }
        }
        
        let highestValue: Double = percentages.max() ?? 0.0
        guard highestValue > 0 else { return }
        
        var i: Int = 0
        percentages.forEach{ percentage in
            percentages[i] = percentage / (highestValue/100)
            i += 1
        }
    }
    
    func muscleInWorkout(workout: Workout, muscle: Muscle) -> Bool {
        return workout.workoutExercises.contains { workoutExercise in
            workoutExercise.exercise?.primaryMuscleIds.contains(muscle.serverId) == true
        }
    }
    
    func muscleGroupInWorkout(workout: Workout, muscleGroup: MuscleGroup) -> Bool {
        return workout.workoutExercises.contains { workoutExercise in
            workoutExercise.exercise?.muscleGroupId == muscleGroup.serverId
        }
    }
}

