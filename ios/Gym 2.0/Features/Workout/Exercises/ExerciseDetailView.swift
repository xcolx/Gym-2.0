//
//  ExerciseDetailView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 18.08.2024.
//

import SwiftUI

struct ExerciseDetailView: View {
    
    
    @State var exercise: Exercise
    
    @Binding var exerciseList: [Exercise]
    @Binding var showExercisesView: Bool
    // false in the performing workout, there the exercise is already part of it
    var showAddButton: Bool = true

    @State var deletedExercise: Bool = false
    
    @State var showSheet: Bool = false
    
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        VStack{
            // Same icon as in the exercise list
            if exercise.verified{
                Label("Verified Exercise", systemImage: "checkmark.circle")
                    .font(.subheadline)
                    .foregroundStyle(Color.blue)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 10)
            }

            HStack (alignment: .top){

                Rectangle()
                    .fill(Color.gray.opacity(0.2))
                    .aspectRatio(1, contentMode: .fit)
                    .overlay(alignment: .topLeading){
                        ScrollView{
                            if let description = exercise.exerciseDescription, !description.isEmpty{
                                Text(description)
                            } else{
                                Text("No description was added :(")
                            }
                        }
                        .padding(5)
                    }
                                
                Rectangle()
                    .aspectRatio(1, contentMode: .fit)
                    .overlay(
                        ExerciseImagesView(images: imageItems) {
                            Image(systemName: "photo")
                                .font(.largeTitle)
                                .foregroundStyle(.white)
                        }
                    )
                    .clipped()
            }
            .padding(.horizontal, 10)

            HStack(alignment: .firstTextBaseline){
                Text("Tracked per Set:")
                    .font(.headline)
                Text(exercise.trackedMetrics.map(\.name).joined(separator: ", "))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            
            HStack{
                HighlightedBodyView(primaryMuscles: exercise.primaryMuscles, secondaryMuscles: exercise.secondaryMuscles)
                
                VStack(alignment: .leading){
                    Text("Primary Muscles")
                        .font(.headline)
                    ScrollView{
                        VStack(alignment: .leading){
                            ForEach(exercise.primaryMuscles) {muscle in
                                Text(muscle.name)
                            }
                        }
                    }
                    
                    Text("Secondary Muscles")
                        .font(.headline)
                    ScrollView{
                        VStack(alignment: .leading){
                            ForEach(exercise.secondaryMuscles) {muscle in
                                Text(muscle.name)
                            }
                        }
                    }
                    
                    
                    Text("Muscle Group")
                        .font(.headline)
                    Text(exercise.muscleGroup?.name ?? "")
                        .padding(.bottom, 10)
                    
                    Text("Equipment")
                        .font(.headline)
                    Text(exercise.equipment?.name ?? "")
                    .padding(.bottom, 20)
                    
                    
                    
                }
            }
            .padding(.trailing, 10)
            
             
            .navigationTitle(exercise.name)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { toolbarButtons }
            }
            .fullScreenCover(isPresented: $showSheet, content: {
                CreateExerciseView(exercise: exercise, editMode: true, deletedExercise: $deletedExercise)
            })
        }
        .onChange(of: deletedExercise) {
            dismiss()
        }

    }
    
    
    
    
    
    // e.g. one per keyframe of the movement, the pending ones after the uploaded ones
    var imageItems: [ExerciseImageItem] {
        ExerciseImageItem.items(
            imageUrls: exercise.imageUrls,
            pendingImages: exercise.pendingImages.enumerated().map { (id: "pending-\($0.offset)", data: $0.element) }
        )
    }

    var toolbarButtons: some View{
        HStack {
            
            // verified exercises can't be changed
            if exercise.canEdit {
                Button(action: {
                    showSheet.toggle()
                }, label: {
                    Image(systemName: "pencil")
                        .foregroundStyle(Color("MyBlack"))
                        .font(.title)
                        .accessibilityLabel("Edit exercise")
                })
            }
            
            if showAddButton {
                Button(action: {
                    exerciseList.append(exercise)
                    showExercisesView.toggle()
                    dismiss()
                }, label: {
                    Image(systemName: "plus.circle")
                        .font(.title)
                        .foregroundStyle(Color.green)
                        .accessibilityLabel("Add to workout")
                })
                .padding(.trailing, 10)
            }
        }
    }
    
    
    
    
}
