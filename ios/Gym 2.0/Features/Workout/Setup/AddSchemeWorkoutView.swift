//
//  AddSchemeWorkoutView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 19.08.2024.
//

import SwiftData
import SwiftUI

struct AddSchemeWorkoutView: View {
    
    @State var workoutScheme = WorkoutScheme()
    @State var localName: String = ""
    @State var localExercises: [Exercise] = []
    
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) var context
    
    var body: some View {
        
        EditWorkoutView(navStackTitle: "Add Workout Scheme", workoutTitle: $localName, exerciseList: $localExercises)
        
        HStack{
            Spacer()
            
            Button(action: {
                WorkoutSchemeRepository(context: context).create(workoutScheme, name: localName, exercises: localExercises)
                dismiss()
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
        }.padding(.bottom, 10)
    }
}
