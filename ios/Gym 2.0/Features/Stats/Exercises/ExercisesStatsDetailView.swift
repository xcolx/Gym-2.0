//
//  ExercisesStatsDetailView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 10.09.2024.
//

import SwiftUI
import SwiftData

struct ExercisesStatsDetailView: View {
        
    @State var exercise: Exercise
    @Environment(UserSettings.self) var userSettings
    
    @State var filteredPastWorkoutExercises: [WorkoutExercise] = []
    
    @Query(
        filter: #Predicate <WorkoutExercise> {$0.workout?.inProgress == false} ,
        sort: [SortDescriptor(\WorkoutExercise.workout?.date, order: .reverse)]
    ) var workoutExercises: [WorkoutExercise]
    
    var body: some View {
        VStack{
            
            summaryView
            .padding(.horizontal, 10)
            
            .navigationTitle(exercise.name)
            
        }
        
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
        .onAppear{
            // Computed once: as a computed property, cancelling updates the view again for a workout that doesn't
            // exist anymore
            self.filteredPastWorkoutExercises = workoutExercises.compactMap { workoutExercise in
                if workoutExercise.exercise == exercise {
                    return workoutExercise
                } else {
                    return nil
                }
            }
        }

    }
    
    // Only the values the exercise tracks
    var summaryView: some View {
        let summary = StatsCalculator.summary(of: filteredPastWorkoutExercises)
        let weightUnit = userSettings.weightUnit
        let distanceUnit = userSettings.distanceUnit
        return VStack{
            StatRowView("Workouts", "\(summary.workouts)")
            StatRowView("Sets", "\(summary.sets)")
            
            if exercise.tracksReps{
                StatRowView("Total Reps", "\(Int(summary.reps.total))")
                StatRowView("Avg Reps per Set", average(summary.reps) { UnitSystem.number($0, maxDecimals: 1) })
            }
            if exercise.tracksWeights{
                if exercise.tracksReps{
                    StatRowView("Volume", weightUnit.formatVolume(kilograms: summary.volume))
                }
                StatRowView("Personal Record", summary.personalRecord.map { StatsSummary.formatRecord($0, unit: weightUnit) } ?? "–")
            }
            if exercise.tracksTime{
                StatRowView("Total Time", StatsSummary.formatTime(seconds: summary.time.total))
                StatRowView("Avg Time per Set", average(summary.time) { StatsSummary.formatTime(seconds: $0) })
                StatRowView("Longest Set", maximum(summary.time) { StatsSummary.formatTime(seconds: $0) })
            }
            if exercise.tracksIntensity{
                StatRowView("Avg Intensity", average(summary.intensity, StatsSummary.formatIntensity))
                StatRowView("Highest Intensity", maximum(summary.intensity, StatsSummary.formatIntensity))
            }
            if exercise.tracksDistance{
                StatRowView("Total Distance", distanceUnit.formatDistance(meters: summary.distance.total))
                StatRowView("Avg Distance per Set", average(summary.distance) { distanceUnit.formatDistance(meters: $0) })
                StatRowView("Longest Set", maximum(summary.distance) { distanceUnit.formatDistance(meters: $0) })
            }
        }
    }
    
    // "–" if no value was entered yet
    func average(_ metric: StatsSummary.Metric, _ format: (Double) -> String) -> String {
        metric.average.map(format) ?? "–"
    }
    
    func maximum(_ metric: StatsSummary.Metric, _ format: (Double) -> String) -> String {
        metric.count > 0 ? format(metric.max) : "–"
    }
    
}
