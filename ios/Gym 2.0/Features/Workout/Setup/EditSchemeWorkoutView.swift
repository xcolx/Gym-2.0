//
//  EditSchemeWorkoutView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 19.08.2024.
//

import SwiftData
import SwiftUI

struct EditSchemeWorkoutView: View {
    
    @Binding var navigationStackPath: [NavigationDestination]
    
    @State var workoutScheme: WorkoutScheme
    
    @State var localName: String = ""
    @State var localExercises: [Exercise] = []
    
    @State var showDeleteAlert: Bool = false
    
    @Environment(\.modelContext) var context
    
    var body: some View {
        
        VStack{
            EditWorkoutView(navStackTitle: "Edit: " + workoutScheme.name, workoutTitle: $localName, exerciseList: $localExercises)
            
            HStack{
                
                Spacer()
                Spacer()
                
                Button(action: {
                    WorkoutSchemeRepository(context: context).update(workoutScheme, name: localName, exercises: localExercises)
                    
                    navigationStackPath = []
                }, label: {
                    Text("Save Workout")
                        .foregroundStyle(Color("MyWhite"))
                        .font(.title)
                        .padding(15)
                        .background(
                            RoundedRectangle(cornerRadius: 25)
                                .tint(Color("MyBlack"))
                        )
                })
                
                Spacer()
                
                Button(action: {
                    showDeleteAlert.toggle()
                }, label: {
                    Image(systemName: "trash")
                        .font(.title)
                        .foregroundStyle(.red)
                        .padding(15)
                        .accessibilityLabel("Delete workout scheme")
                        .background(
                            Circle()
                                .stroke(lineWidth: 2)
                                .foregroundStyle(.red)
                        )
                })
            }
            .padding(10)
            .padding(.bottom, 10)
        }
            
        .onAppear {
            localName = workoutScheme.name
            
            localExercises = workoutScheme.sortedExercises
        }
        .alert("Are you sure you want to delete this workout?", isPresented: $showDeleteAlert) {
            Button("Delete", role: .destructive) {
                WorkoutSchemeRepository(context: context).delete(workoutScheme)
                navigationStackPath = []
            }
            Button("Go back", role: .cancel) {}
        } message: {
            Text("There is no way to recover it.")
        }
        
    }
    
}
