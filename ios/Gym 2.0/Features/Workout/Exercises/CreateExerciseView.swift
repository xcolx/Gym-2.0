//
//  CreateExerciseView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 18.08.2024.
//

import SwiftUI
import PhotosUI
import SwiftData

struct CreateExerciseView: View {

    // nil to create a new exercise
    let exercise: Exercise?
    let editMode: Bool?

    @Binding var deletedExercise: Bool

    // the input of a new exercise to continue, after the system ended the app in the background
    var draft: CreateExerciseDraft? = nil

    @Environment(\.modelContext) private var context

    init(exercise: Exercise?, editMode: Bool? = nil, deletedExercise: Binding<Bool>, draft: CreateExerciseDraft? = nil) {
        self.exercise = exercise
        self.editMode = editMode
        _deletedExercise = deletedExercise
        self.draft = draft
    }

    var body: some View {
        CreateExerciseContentView(
            model: CreateExerciseViewModel(exercise: exercise, draft: draft, repository: ExerciseRepository(context: context)),
            editMode: editMode,
            deletedExercise: $deletedExercise
        )
    }
}

private struct CreateExerciseContentView: View {

    @State private var model: CreateExerciseViewModel
    let editMode: Bool?
    @Binding var deletedExercise: Bool

    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @Environment(UserSettings.self) var userSettings

    @Query(sort: \MuscleGroup.name) var allMuscleGroups: [MuscleGroup]
    @Query(sort: \Muscle.name) var allMuscles: [Muscle]
    @Query(sort: \Equipment.name) var allEquipment: [Equipment]

    // The view model is created once, later ones of the parent's body are discarded
    init(model: CreateExerciseViewModel, editMode: Bool?, deletedExercise: Binding<Bool>) {
        _model = State(initialValue: model)
        self.editMode = editMode
        _deletedExercise = deletedExercise
    }

    var body: some View {
        @Bindable var model = model
        // read here, the label of the photos picker isn't isolated to the main actor
        let imageCount = model.imageCount
        VStack{

            HStack {
                Button(action: {
                    dismiss()
                }, label: {
                    Image(systemName: "xmark")
                        .font(.title)
                        .foregroundStyle(Color.red)
                        .padding(.leading, 10)
                        .accessibilityLabel("Cancel")
                })


                TextField("Name of the Exercise", text: $model.name)
                    .autocorrectionDisabled()
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                    .padding(.trailing, 10)
                    .padding(.vertical, 10)
                    .font(.title)
                    .foregroundStyle(model.nameProblem != nil ? Color.red : Color("MyBlack"))

                if editMode != nil{
                    Button(action: {
                        model.requestDeletion()
                    }, label: {
                        Image(systemName: "trash")
                            .foregroundStyle(Color.red)
                            .font(.title)
                            .padding(.vertical, 10)
                            .padding(.trailing, 10)
                            .accessibilityLabel("Delete exercise")
                    })
                }
            }

            if let problem = model.problem {
                Text(problem)
                    .font(.caption)
                    .foregroundStyle(Color.red)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 10)
            }

            HStack{

                VStack (alignment: .leading) {
                    Text("Description:")
                        .font(.headline)
                    TextEditor(text: $model.exerciseDescription)
                        .background(Color.gray.opacity(0.2))
                        .aspectRatio(1, contentMode: .fit)
                    .border(Color("MyBlack"), width: 1)
                }

                VStack (alignment: .leading) {
                    HStack(spacing: 4) {
                        Text("Images:")
                            .font(.headline)
                        Text("\(model.imageCount)/\(Exercise.maxImages)")
                            .foregroundStyle(.secondary)
                    }
                    Rectangle()
                        .fill(Color.black)
                        .aspectRatio(1, contentMode: .fit)
                        .overlay(
                            ExerciseImagesView(
                                images: ExerciseImageItem.items(imageUrls: model.imageUrls, pendingImages: model.photos.map { (id: $0.id.uuidString, data: $0.data) }),
                                showsTrailing: model.imageCount < Exercise.maxImages,
                                onRemove: model.removeImage
                            ) {
                                Image(systemName: "photo.badge.plus")
                                    .font(.largeTitle)
                                    .foregroundStyle(.white)
                            } trailing: {
                                PhotosPicker(selection: $model.selectedPhotos, maxSelectionCount: max(1, Exercise.maxImages - model.imageCount), matching: .images, photoLibrary: .shared()) {
                                    VStack(spacing: 4) {
                                        Image(systemName: "photo.badge.plus")
                                            .font(.largeTitle)
                                        if imageCount > 0 {
                                            Text("Add more")
                                                .font(.footnote)
                                        }
                                    }
                                    .foregroundStyle(.white)
                                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                                    .contentShape(Rectangle())
                                }
                                .accessibilityLabel("Add images")
                            }
                        )
                        .clipped()
                }

            }
            .padding(.horizontal, 10)

            aliasSelection
                .padding(.horizontal, 10)
                .padding(.top, 5)

            metricSelection
                .padding(.horizontal, 10)
                .padding(.vertical, 5)

            HStack{
                VStack(alignment: .leading){
                    HighlightedBodyView(primaryMuscles: model.primaryMuscles, secondaryMuscles: model.secondaryMuscles)

                    Spacer()

                    VStack(alignment: .leading){
                        HStack {
                            Text("Muscle Group:")
                                .font(.headline)
                            Button(action: {
                                model.showsMuscleGroupDialog = true
                            }, label: {
                                Image(systemName: "pencil")
                                    .foregroundStyle(Color.green)
                                    .accessibilityLabel("Choose muscle group")
                            })
                        }
                        Text(model.muscleGroup?.name ?? "Select a muscle group")
                            .foregroundStyle(model.missingSelectionWarning && model.muscleGroup == nil ? Color.red : Color("MyBlack"))
                    }
                    .padding(.leading, 10)
                    .padding(.bottom, 10)

                    VStack(alignment: .leading){
                        HStack{
                            Text("Equipment needed:")
                                .font(.headline)
                            Button(action: {
                                model.showsEquipmentDialog = true
                            }, label: {
                                Image(systemName: "pencil")
                                    .foregroundStyle(Color.green)
                                    .accessibilityLabel("Choose equipment")
                            })
                        }
                        Text(model.equipment?.name ?? "Select the equipment")
                            .foregroundStyle(model.missingSelectionWarning && model.equipment == nil ? Color.red : Color("MyBlack"))
                    }
                    .padding(.leading, 10)

                }


                VStack(alignment: .leading){
                    HStack {
                        Text("Primary Muscles:")
                            .font(.headline)
                        Button(action: {
                            model.musclePicker = .primary
                        }, label: {
                            Image(systemName: "plus.circle")
                                .foregroundStyle(Color.green)
                                .accessibilityLabel("Choose primary muscles")
                        })
                    }
                    ScrollView {
                        VStack(alignment: .leading){
                            ForEach(model.primaryMuscles) {muscle in
                                Text(muscle.name)
                            }
                        }
                    }

                    HStack {
                        Text("Secondary Muscles:")
                            .font(.headline)
                        Button(action: {
                            model.musclePicker = .secondary
                        }, label: {
                            Image(systemName: "plus.circle")
                                .foregroundStyle(Color.green)
                                .accessibilityLabel("Choose secondary muscles")
                        })
                    }
                    ScrollView{
                        VStack(alignment: .leading){
                            ForEach(model.secondaryMuscles) {muscle in
                                Text(muscle.name)
                            }
                        }
                    }
                    HStack{
                        Spacer()
                        Button(action: {
                            if model.save() {
                                dismiss()
                            }
                        }, label: {
                            HStack {
                                Text("Save")
                                Image(systemName: "square.and.arrow.down")
                            }
                            .foregroundStyle(Color("MyWhite"))
                            .font(.title)
                            .padding(15)
                            .background(
                                RoundedRectangle(cornerRadius: 25)
                                    .foregroundStyle(Color.green)
                            )
                        })
                        .padding(.trailing, 10)
                    }
                }


            }
        }
        .alert("You can't delete this exercise!", isPresented: Binding(get: { model.nonDeletableReason != nil }, set: { if !$0 { model.nonDeletableReason = nil } })) {
            Button("Got it", role: .cancel) {}
        } message: {
            Text(model.nonDeletableReason ?? "")
        }
        .alert("Delete", isPresented: $model.showsDeleteConfirmation) {
            Button("Delete", role: .destructive) {
                model.delete()
                dismiss()
                deletedExercise = true
            }
            Button("Go back", role: .cancel) {}
        } message: {
            Text("Are you sure you want to delete this exercise?")
        }

        .ignoresSafeArea(.keyboard)
        .confirmationDialog("Muscle Group", isPresented: $model.showsMuscleGroupDialog, titleVisibility: .visible) {
            ForEach(allMuscleGroups) { currentMuscleGroup in
                Button(currentMuscleGroup.name) {
                    model.muscleGroup = currentMuscleGroup
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Select the most important muscle group for this exercise")
        }
        .confirmationDialog("Equipment", isPresented: $model.showsEquipmentDialog, titleVisibility: .visible) {
            ForEach(allEquipment) { pieceOfEquipment in
                Button(pieceOfEquipment.name) {
                    model.select(pieceOfEquipment)
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Select the equipment needed for this exercise")
        }
        .sheet(item: $model.musclePicker) { role in
            // a muscle is either primary or secondary, the server refuses it in both lists
            switch role {
            case .primary:
                MusclePickerView(title: "Primary Muscles", allMuscles: allMuscles, selected: $model.primaryMuscles, other: $model.secondaryMuscles)
            case .secondary:
                MusclePickerView(title: "Secondary Muscles", allMuscles: allMuscles, selected: $model.secondaryMuscles, other: $model.primaryMuscles)
            }
        }
        .task(id: model.selectedPhotos){
            await model.loadSelectedPhotos()
        }

        .onAppear{
            model.onAppear(muscleGroups: allMuscleGroups, muscles: allMuscles, equipment: allEquipment)
        }
        // the system may end the app in the background, MainView then opens this view again with the draft
        .onChange(of: scenePhase) {
            if scenePhase == .background {
                model.didEnterBackground()
            }
        }
        .onDisappear {
            model.onDisappear()
        }
    }

    // Other names like "Military Press" for "Barbell Shoulder Press", so that the exercise is found by them
    var aliasSelection: some View {
        @Bindable var model = model
        return VStack(alignment: .leading){
            Text("Other Names:")
                .font(.headline)
            ScrollView(.horizontal){
                HStack{
                    ForEach(model.aliases, id: \.self) { alias in
                        Button(action: {
                            model.removeAlias(alias)
                        }, label: {
                            HStack(spacing: 4){
                                Text(alias)
                                Image(systemName: "xmark")
                                    .font(.caption2)
                            }
                            .font(.subheadline)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .foregroundStyle(userSettings.appColorForeground)
                            .background(
                                Capsule()
                                    .fill(userSettings.appColor)
                            )
                        })
                        .accessibilityLabel("Remove \(alias)")
                    }
                    if model.aliases.count < CreateExerciseViewModel.maxAliasCount {
                        TextField("Add a name", text: $model.newAlias)
                            .autocorrectionDisabled()
                            .submitLabel(.done)
                            .onSubmit(model.addAlias)
                            .font(.subheadline)
                            .foregroundStyle(model.aliasProblem != nil ? Color.red : Color("MyBlack"))
                            .frame(width: 150)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(
                                Capsule()
                                    .fill(Color.gray.opacity(0.2))
                            )
                    }
                }
            }
            .scrollIndicators(.hidden)
            Text("Only used to find the exercise when searching.")
                .font(.caption)
                .foregroundStyle(Color.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    var metricSelection: some View {
        VStack(alignment: .leading){
            Text("Tracked per Set:")
                .font(.headline)
                .foregroundStyle(model.missingSelectionWarning && model.trackedMetrics.isEmpty ? Color.red : Color("MyBlack"))
            ScrollView(.horizontal){
                HStack{
                    ForEach(SetMetric.allCases, id: \.self) { metric in
                        let selected = model.trackedMetrics.contains(metric)
                        Button(action: {
                            model.toggle(metric)
                        }, label: {
                            Text(metric.name)
                                .font(.subheadline)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 6)
                                .foregroundStyle(selected ? userSettings.appColorForeground : Color("MyBlack"))
                                .background(
                                    Capsule()
                                        .fill(selected ? userSettings.appColor : Color.gray.opacity(0.2))
                                )
                        })
                        .disabled(!model.canChangeTrackedMetrics)
                    }
                }
            }
            .scrollIndicators(.hidden)
            if !model.canChangeTrackedMetrics {
                Text("You have already done a workout with this exercise, so the tracked values can't be changed.")
                    .font(.caption)
                    .foregroundStyle(Color.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Which muscles of the exercise are picked in the muscle picker
enum MuscleRole: Identifiable {
    case primary, secondary

    var id: Self { self }
}

/// All muscles with a checkmark at the selected ones, tapping one adds or removes it. A muscle added here is removed
/// from `other`, the muscles of the other role.
private struct MusclePickerView: View {

    let title: String
    let allMuscles: [Muscle]
    @Binding var selected: [Muscle]
    @Binding var other: [Muscle]

    @Environment(\.dismiss) private var dismiss
    @Environment(UserSettings.self) private var userSettings

    var body: some View {
        NavigationStack {
            List(allMuscles) { muscle in
                let isSelected = selected.contains(muscle)
                Button {
                    if isSelected {
                        selected.removeAll { $0 == muscle }
                    } else {
                        selected.append(muscle)
                        other.removeAll { $0 == muscle }
                    }
                } label: {
                    HStack {
                        Text(muscle.name)
                            .foregroundStyle(Color.primary)
                        Spacer()
                        if isSelected {
                            Image(systemName: "checkmark")
                                .foregroundStyle(userSettings.appColor)
                        }
                    }
                }
                .accessibilityAddTraits(isSelected ? .isSelected : [])
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}

/// A photo added to the exercise that isn't uploaded yet, scaled down by ExerciseImageUpload
struct PickedExercisePhoto: Identifiable {
    let id = UUID()
    let data: Data
}
