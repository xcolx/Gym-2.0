//
//  FreeWorkoutView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 19.08.2024.
//

import SwiftUI
import SwiftData

struct FreeWorkoutView: View {
    
    @Binding var navigationStackPath: [NavigationDestination]
    
    @State var workoutTitle: String = ""
    @State var exerciseList: [Exercise] = []
        
    @Environment(\.modelContext) var context
    @Environment(UserSettings.self) var userSettings
    
    // A new workout can only be started if none is in progress
    @Query(filter: #Predicate<Workout> { $0.inProgress == true }) private var workoutsInProgress: [Workout]
    @State private var showsWorkoutInProgress = false
        
    var body: some View {
        EditWorkoutView(navStackTitle: "Free Workout", workoutTitle: $workoutTitle, exerciseList: $exerciseList)
        
        HStack{
            Spacer()
            
            Button(action: {
                guard workoutsInProgress.isEmpty else {
                    showsWorkoutInProgress = true
                    return
                }
                if workoutTitle == ""{
                    workoutTitle = "Free Workout"
                }
                let workout = Workout.create(name: workoutTitle, exercises: exerciseList, bodyWeight: userSettings.bodyweight ?? 0)
                WorkoutRepository(context: context).start(workout)
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
        .inProgressWorkoutChooser(isPresented: $showsWorkoutInProgress, title: "A workout is already in progress", message: "Finish or cancel it before you start a new one.") { workout in
            navigationStackPath = [.workout(workout)]
        }
    }
}
