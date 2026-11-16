//
//  AddSchemeWorkoutView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 19.08.2024.
//

import SwiftData
import SwiftUI

/// A new workout scheme, empty or prefilled with the name and exercises of a past workout
struct AddSchemeWorkoutView: View {
    
    @State var workoutScheme = WorkoutScheme()
    @State var localName: String = ""
    @State var localExercises: [Exercise] = []
    /// Shown as a sheet with its own navigation stack, which has no back button to leave it with
    var showsCancel = false
    
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) var context
    
    var body: some View {
        
        EditWorkoutView(navStackTitle: "New workout", workoutTitle: $localName, exerciseList: $localExercises) {
            Button {
                WorkoutSchemeRepository(context: context).create(workoutScheme, name: localName, exercises: localExercises)
                dismiss()
            } label: {
                Label("Save workout", systemImage: "checkmark")
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(localExercises.isEmpty || localName.trimmingCharacters(in: .whitespaces).isEmpty)
        }
        .toolbar {
            if showsCancel {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }
}
