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
    case muscleGroup = "Muscle group"
    
    var id: String { rawValue }
}

struct DistributionByMuscleView: View {
    
    @State var selectedValueCriteria: ValueCriteria = .sets
    @State var selectedCategoryCriteria: CategoryCriteria = .muscle
    /// The value of every muscle or muscle group, in the order of the names
    @State var values: [Double] = []
    
    @Query(
        filter: #Predicate <Workout> {$0.inProgress == false}
    ) var workouts: [Workout]
    
    @Query(sort: \Muscle.name) var muscles: [Muscle]
    @Query(sort: \MuscleGroup.name) var muscleGroups: [MuscleGroup]
    
    @Environment(UserSettings.self) var userSettings

    // The names with their values, the most trained first
    private var rows: [(name: String, value: Double)] {
        let names = selectedCategoryCriteria == .muscle ? muscles.map(\.name) : muscleGroups.map(\.name)
        return zip(names, values)
            .map { (name: $0, value: $1) }
            .sorted { $0.value != $1.value ? $0.value > $1.value : $0.name < $1.name }
    }
    
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if workouts.isEmpty {
                    ContentUnavailableView("No workouts yet", systemImage: "figure.strengthtraining.traditional", description: Text("After your first workout you will see here how much you trained each muscle."))
                        .padding(.top, 40)
                } else {
                    AppColorSegmentedPicker(options: CategoryCriteria.allCases, selection: $selectedCategoryCriteria) { $0.rawValue }
                    AppColorSegmentedPicker(options: ValueCriteria.allCases, selection: $selectedValueCriteria) { $0.rawValue }

                    let rows = rows
                    let highest = max(rows.first?.value ?? 0, 1)
                    Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 12) {
                        ForEach(rows, id: \.name) { row in
                            GridRow {
                                Text(row.name)
                                    .font(.subheadline)
                                Capsule()
                                    .fill(Color(.systemFill))
                                    .frame(height: 10)
                                    .overlay(alignment: .leading) {
                                        GeometryReader { proxy in
                                            Capsule()
                                                .fill(userSettings.appColor)
                                                .frame(width: proxy.size.width * row.value / highest)
                                        }
                                    }
                                    .frame(maxWidth: .infinity)
                                Text("\(Int(row.value.rounded()))")
                                    .font(.subheadline)
                                    .monospacedDigit()
                                    .foregroundStyle(.secondary)
                                    .gridColumnAlignment(.trailing)
                            }
                            .accessibilityElement(children: .combine)
                        }
                    }
                    .padding()
                    .cardBackground()
                    .animation(.snappy, value: values)
                    .padding(.top, 4)

                    if selectedCategoryCriteria == .muscle && selectedValueCriteria != .workouts {
                        Text("A secondary muscle counts a third of a set.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, 4)
                    }
                }
            }
            .padding()
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("Muscle distribution")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear{
            calculateValues()
        }
        .onChange(of: selectedValueCriteria){
            calculateValues()
        }
        .onChange(of: selectedCategoryCriteria){
            calculateValues()
        }
    }
    
    func calculateValues(){
        if selectedCategoryCriteria == .muscle{
            values = Array(repeating: 0.0, count: muscles.count)
        } else {
            values = Array(repeating: 0.0, count: muscleGroups.count)
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
                values[muscleIndex] = count
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
                values[muscleIndex] = count
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
                values[muscleIndex] = count
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
                values[muscleIndex] = count
                muscleIndex += 1
                count = 0
            }
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

