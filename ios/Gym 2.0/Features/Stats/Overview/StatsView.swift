//
//  StatsView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 14.08.24.
//

import SwiftUI

/// The screens of the stats tab. Pushed by value, so that a destination is only created when it's shown: built eagerly
/// by NavigationLink(destination:), the toolbar of a pushed screen updated the screen below it, which created the
/// destination again, in an endless loop that froze the app.
enum StatsRoute: Hashable {
    case distribution
    case exercises
    case exercise(Exercise)
    case pastWorkouts
    case pastWorkout(Workout)
    case facts
}

struct StatsView: View {
    
    @Binding var tabSelection: String
    @Binding var workoutNavigationStackPath: [NavigationDestination]
    
    var body: some View {
        NavigationStack{
            VStack(alignment: .leading){
            
                ImportantStatsView()
                    .padding(.bottom, 15)
                
                NavigationLink(value: StatsRoute.distribution){
                    Text("Distribution by Muscle")
                        .foregroundStyle(Color("MyWhite"))
                        .font(.title)
                        .padding(15)
                        .background(
                            RoundedRectangle(cornerRadius: 25)
                                .tint(Color("MyBlack"))
                        )
                }
                 
                
                NavigationLink(value: StatsRoute.exercises){
                    Text("Exercises")
                        .foregroundStyle(Color("MyWhite"))
                        .font(.title)
                        .padding(15)
                        .background(
                            RoundedRectangle(cornerRadius: 25)
                                .tint(Color("MyBlack"))
                        )
                }
                
                NavigationLink(value: StatsRoute.pastWorkouts){
                    Text("Past Workouts")
                        .foregroundStyle(Color("MyWhite"))
                        .font(.title)
                        .padding(15)
                        .background(
                            RoundedRectangle(cornerRadius: 25)
                                .tint(Color("MyBlack"))
                        )
                }
                
                NavigationLink(value: StatsRoute.facts){
                    Text("Interesting Facts")
                        .foregroundStyle(Color("MyWhite"))
                        .font(.title)
                        .padding(15)
                        .background(
                            RoundedRectangle(cornerRadius: 25)
                                .tint(Color("MyBlack"))
                        )
                }

                Spacer()
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .navigationTitle("Statistics")
            .navigationDestination(for: StatsRoute.self) { route in
                switch route {
                case .distribution:
                    DistributionByMuscleView()
                case .exercises:
                    ExercisesStatsView()
                case .exercise(let exercise):
                    ExercisesStatsDetailView(exercise: exercise)
                case .pastWorkouts:
                    PastWorkoutsView()
                case .pastWorkout(let workout):
                    PastWorkoutDetailView(workout: workout, tabSelection: $tabSelection, workoutNavigationStackPath: $workoutNavigationStackPath)
                case .facts:
                    InterestingFactsView()
                }
            }            
        }
    }
}
