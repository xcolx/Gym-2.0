//
//  ExercisesView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 17.08.2024.
//

import SwiftUI
import SwiftData

struct ExercisesView: View {
    
    @Binding var showExercisesView: Bool
    @Binding var exerciseList: [Exercise]
    
    @State var searchText = ""
    @State var selectedMuscleGroup: MuscleGroup?
    @State var selectedPrimaryMuscle: Muscle?
    @State var selectedEquipment: Equipment?
    
    @State var showCreateExerciseSheet: Bool = false
    
    @Query(
        sort: [SortDescriptor(\Exercise.name, order: .forward)]
    )private var exercises: [Exercise]
    
    @Query(sort: \MuscleGroup.name) private var muscleGroups: [MuscleGroup]
    @Query(sort: \Muscle.name) private var muscles: [Muscle]
    @Query(sort: \Equipment.name) private var equipment: [Equipment]
    
    var filteredExercises: [Exercise]{
        var filteredExercises: [Exercise] = exercises
        
        if let selectedMuscleGroup {
            filteredExercises = filteredExercises.filter(){$0.muscleGroupId == selectedMuscleGroup.serverId}
        }
        if let selectedEquipment {
            filteredExercises = filteredExercises.filter(){$0.equipmentId == selectedEquipment.serverId}
        }
        
        if let selectedPrimaryMuscle {
            filteredExercises = filteredExercises.filter(){$0.primaryMuscleIds.contains(selectedPrimaryMuscle.serverId)}
        }
        
        // best match first
        if searchText.isEmpty == false{
            filteredExercises = FuzzySearch.filter(filteredExercises, query: searchText) { $0.searchNames }
        }
        return filteredExercises
    }
    
    // The exercises grouped by their first letter, "#" for names starting with something else
    var exercisesByLetter: [(letter: String, exercises: [Exercise])] {
        let groups = Dictionary(grouping: filteredExercises) { exercise -> String in
            let first = exercise.name.trimmingCharacters(in: .whitespaces).prefix(1)
                .folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
                .uppercased()
            return first.first?.isLetter == true ? first : "#"
        }
        return groups.keys
            .sorted { ($0 == "#") != ($1 == "#") ? $1 == "#" : $0 < $1 }
            .map { ($0, groups[$0] ?? []) }
    }
    
    
    var body: some View {
        NavigationStack {
            VStack{
                
                HStack {
                    VStack {
                        Text("Muscle Group")
                        Picker("Select a Muscle Group", selection: $selectedMuscleGroup){
                            Text("All").tag(nil as MuscleGroup?)
                            ForEach(muscleGroups) {muscleGroup in
                                Text(muscleGroup.name).tag(muscleGroup as MuscleGroup?)
                            }
                        }
                        .pickerStyle(MenuPickerStyle())
                    }
                    
                    VStack {
                        Text("Primary Muscle")
                        Picker("Select a Primary Muscle", selection: $selectedPrimaryMuscle){
                            Text("All").tag(nil as Muscle?)
                            ForEach(muscles) {muscle in
                                Text(muscle.name).tag(muscle as Muscle?)
                            }
                        }
                        .pickerStyle(MenuPickerStyle())
                    }
                    
                    VStack {
                        Text("Equipment")
                        Picker("Select the Equipment", selection: $selectedEquipment){
                            Text("All").tag(nil as Equipment?)
                            ForEach(equipment) {PieceOfEquipment in
                                Text(PieceOfEquipment.name).tag(PieceOfEquipment as Equipment?)
                            }
                        }
                        .pickerStyle(MenuPickerStyle())
                    }
                }
                
                Spacer()

                List(){
                    if searchText.isEmpty {
                        Section {} header: {
                            Text("Number of Exercises: \(filteredExercises.count)")
                        }
                        ForEach(exercisesByLetter, id: \.letter) { group in
                            Section(group.letter){
                                ForEach(group.exercises) { exercise in
                                    exerciseRow(exercise)
                                }
                            }
                        }
                    } else {
                        // Ranked by how well they match, so not split by letter
                        Section("Number of Exercises: \(filteredExercises.count)"){
                            ForEach(filteredExercises) { exercise in
                                exerciseRow(exercise)
                            }
                        }
                    }
                }
                
            
            }
            .navigationTitle("Exercises")
            // By value, see StatsRoute
            .navigationDestination(for: Exercise.self) { exercise in
                ExerciseDetailView(exercise: exercise, exerciseList: $exerciseList, showExercisesView: $showExercisesView)
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { toolbarButton }
            }
        }
        .searchable(text: $searchText)
        // Not on the Spacer: its presentations are created anew when the app goes to the background, which lost the
        // input of the exercise being created
        .fullScreenCover(isPresented: $showCreateExerciseSheet, content: {
            CreateExerciseView(exercise: nil, deletedExercise: Binding.constant(false))
        })
        .overlay{
            if filteredExercises.isEmpty {
                ContentUnavailableView.search
            }
        }
    }
    
    
    func exerciseRow(_ exercise: Exercise) -> some View {
        NavigationLink(value: exercise, label: {
            HStack{
                Text(exercise.name)
                if exercise.verified{
                    Image(systemName: "checkmark.circle")
                        .foregroundStyle(Color.blue)
                        .accessibilityLabel("Verified")
                }
            }
        })
    }
    
    var toolbarButton: some View{
        HStack{
            Button(action: {
                showCreateExerciseSheet.toggle()
            }, label: {
                Image(systemName: "plus.circle")
                    .font(.headline)
                    .foregroundStyle(Color.green)
                    .accessibilityLabel("Create exercise")
            })
            .padding(10)
            .padding(.top, 10)
        }
    }
    
    
}
