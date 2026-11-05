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
        
        EditWorkoutView(navStackTitle: "Edit workout", workoutTitle: $localName, exerciseList: $localExercises) {
            Button {
                showDeleteAlert.toggle()
            } label: {
                Image(systemName: "trash")
                    .font(.headline)
                    .foregroundStyle(.red)
                    .frame(width: 52, height: 52)
                    .background(Color.red.opacity(0.12), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            .accessibilityLabel("Delete workout")
            Button {
                WorkoutSchemeRepository(context: context).update(workoutScheme, name: localName, exercises: localExercises)
                navigationStackPath = []
            } label: {
                Label("Save workout", systemImage: "checkmark")
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(localExercises.isEmpty || localName.trimmingCharacters(in: .whitespaces).isEmpty)
        }
        .onAppear {
            localName = workoutScheme.name
            
            localExercises = workoutScheme.sortedExercises
        }
        .alert("Delete this workout?", isPresented: $showDeleteAlert) {
            Button("Delete", role: .destructive) {
                WorkoutSchemeRepository(context: context).delete(workoutScheme)
                navigationStackPath = []
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("It can't be recovered.")
        }
        
    }
    
}
