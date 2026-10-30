//
//  EditWorkoutView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 15.08.2024.
//

import SwiftUI

struct EditWorkoutView: View {
    
    @State var navStackTitle: String

    @Binding var workoutTitle: String
    @Binding var exerciseList: [Exercise]
    
    @State var showExercisesView: Bool = false
    
    @Environment(UserSettings.self) var userSettings
    
    var body: some View {
            
            VStack {
                
                HStack{
                    TextField("Give your Workout a Name", text: $workoutTitle)
                        .autocorrectionDisabled()
                        .padding(10)
                        .background(Color.gray.opacity(0.3), in: .rect(cornerRadius: 10))
                        .font(.title)
                        .onChange(of: workoutTitle) {
                            if workoutTitle.count > Workout.maxNameLength {
                                workoutTitle = String(workoutTitle.prefix(Workout.maxNameLength))
                            }
                        }
                }.padding(.horizontal, 10)
                
                List{
                    // by position, an exercise can be in the list more than once
                    ForEach(Array(exerciseList.enumerated()), id: \.offset) { _, exercise in
                        Text(exercise.name)
                            .foregroundStyle(.white)
                    }
                    .onDelete(perform:{indexSet in
                        exerciseList.remove(atOffsets: indexSet)
                    })
                    .onMove(perform: move)
                    .listRowBackground(userSettings.appColor)
                }
                .scrollContentBackground(.hidden)
                .navigationTitle(navStackTitle)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) { toolbarButtons }
                }
                
                
                .sheet(isPresented: $showExercisesView, content:{
                    ExercisesView(showExercisesView: $showExercisesView, exerciseList: $exerciseList)
                })
            }
    }
    
    func move(indices: IndexSet, newOffset: Int){
        exerciseList.move(fromOffsets: indices, toOffset: newOffset)
    }
    
    var toolbarButtons: some View{
        HStack{
            EditButton()
            
            Button(action: {
                showExercisesView.toggle()
            }, label: {
                Image(systemName: "plus.circle")
                    .accessibilityLabel("Add exercises")
            })
        }
    }
    
    
    
}
