//
//  SuggestedWorkoutSettingsView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 15.08.2024.
//

import SwiftUI
import SwiftData

struct SuggestedWorkoutSettingsView: View {
    
    @Binding var navigationStackPath: [NavigationDestination]
    
    @State var workoutTitle: String = ""
    @State var timeForWorkout: Double = 90
    // server ids of the selected equipment, bodyweight exercises are always possible
    @State var selectedEquipmentIds: Set<Int> = []
    let columns: [GridItem] = [
        GridItem(.flexible(), spacing: nil, alignment: nil),
        GridItem(.flexible(), spacing: nil, alignment: nil)
    ]
    
    @Query(filter: Workout.currentWeek()
    ) var workoutsThisWeek: [Workout]
    
    @Query() var exercises: [Exercise]
    @Query(sort: \Equipment.name) var equipment: [Equipment]
    
    @Environment(UserSettings.self) var userSettings
    
    var body: some View {

        VStack (alignment: .leading){
            
            Spacer()
            
            Text("Which Equipment is available for your Workout?")
                .padding(10)
            
            LazyVGrid(columns: columns) {
                ForEach(equipment){ pieceOfEquipment in
                    Button(action: {
                        if selectedEquipmentIds.contains(pieceOfEquipment.serverId) {
                            selectedEquipmentIds.remove(pieceOfEquipment.serverId)
                        } else {
                            selectedEquipmentIds.insert(pieceOfEquipment.serverId)
                        }
                    }, label: {
                        Text(pieceOfEquipment.name)
                            .font(.headline)
                            .padding(10)
                            .foregroundStyle(Color("MyBlack"))
                            .background(
                                RoundedRectangle(cornerRadius: 20)
                                    .fill(isSelected(pieceOfEquipment) ? userSettings.appColor : Color("MyGray"))
                            )
                    })
                    .disabled(isAlwaysAvailable(pieceOfEquipment))
                }
            }
            
            Text("How much time do you want to spend for this workout?")
                .padding(10)
                .padding(.top, 20)
            
            HStack{
                Spacer()
                Text(formatTime(timeInMinutes: timeForWorkout))
                Spacer()
            }
            
            
            Slider(value: $timeForWorkout,
                   in: 15...180,
                   step: 15,
                   onEditingChanged: {_ in
                
            },
                   minimumValueLabel: Text("15 min"),
                   maximumValueLabel: Text("3 h"),
                   label: {
                        Text("Time")
                    }
            )
            .padding(.horizontal, 10)
            .tint(userSettings.appColor)
            
            Spacer()
            Spacer()
            
            HStack{
                Spacer()
                
                NavigationLink(value: NavigationDestination.suggestedWorkout(exerciseList: getSuggestedExerciseList())){
                    Text("Create Workout for me!")
                        .foregroundStyle(Color("MyWhite"))
                        .font(.title)
                        .padding(15)
                        .background(
                            RoundedRectangle(cornerRadius: 25)
                                .tint(Color("MyBlack"))
                        )
                }
                .padding(.bottom, 10)
                
                Spacer()
            }
            
            .navigationTitle("Suggested Workout")
        }
    }
    
    
    func formatTime(timeInMinutes: Double) -> String {
        let timeInMinutes = Int(timeInMinutes)
        let hours = timeInMinutes / 60
        let minutes = timeInMinutes % 60
        
        if hours == 0{
            return "\(minutes) min"
        } else if minutes == 0 {
            return "\(hours) h"
        } else {
            return "\(hours) h \(minutes) min"
        }
    }
    
    func isAlwaysAvailable(_ pieceOfEquipment: Equipment) -> Bool {
        pieceOfEquipment.name == "Body"
    }
    
    func isSelected(_ pieceOfEquipment: Equipment) -> Bool {
        isAlwaysAvailable(pieceOfEquipment) || selectedEquipmentIds.contains(pieceOfEquipment.serverId)
    }
    
    func getSuggestedExerciseList() -> [Exercise]{
        
        //get all exercises that are possible with the available equipment
        let availableEquipmentIds = Set(equipment.filter(isSelected).map(\.serverId))
        var possibleExercises: [Exercise] = exercises.filter { availableEquipmentIds.contains($0.equipmentId) }
        
        
        //reduce exercises to fit into the time
        var numberOfExercises: Int = 0
        if timeForWorkout == 15{
            numberOfExercises = 2
        } else if timeForWorkout == 30{
            numberOfExercises = 3
        } else if timeForWorkout == 45{
            numberOfExercises = 4
        } else if timeForWorkout == 60{
            numberOfExercises = 5
        } else {
            numberOfExercises = Int(timeForWorkout / 15)
        }
        
        //get optimal exercises by taking into account the not yet trained muscles this week
        var optimalExercises: [Exercise] = possibleExercises
        
        
        workoutsThisWeek.musclesTrained().0.forEach{ muscle in
            var index: Int = 0
            while index < optimalExercises.count{
                if optimalExercises[index].primaryMuscleIds.contains(muscle.serverId){
                    optimalExercises.remove(at: index)
                } else {
                    index += 1
                }
            }
        }
                
        
        var exerciseList: [Exercise] = optimalExercises
        
        exerciseList.shuffle()
        if exerciseList.count >= numberOfExercises{
            while exerciseList.count > numberOfExercises{
                exerciseList.removeLast()
            }
        } else {
            possibleExercises.shuffle()
            possibleExercises.forEach{ exercise in
                if !exerciseList.contains(exercise){
                    exerciseList.append(exercise)
                }
            }
            while exerciseList.count > numberOfExercises{
                exerciseList.removeLast()
            }
            
        }
    
        return exerciseList
    }
}
