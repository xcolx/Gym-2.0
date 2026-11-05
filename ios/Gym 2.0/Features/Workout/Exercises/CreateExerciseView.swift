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

    private var isEditing: Bool {
        editMode != nil
    }

    var body: some View {
        @Bindable var model = model
        NavigationStack {
            Form {
                imagesSection

                Section {
                    TextField("e.g. Bench press", text: $model.name)
                        .font(.title3.weight(.semibold))
                        .autocorrectionDisabled()
                        .foregroundStyle(model.nameProblem != nil ? Color.red : Color.primary)
                } header: {
                    Text("Name")
                } footer: {
                    if let problem = model.nameProblem {
                        ProblemText(problem)
                    }
                }

                aliasSection

                Section {
                    TextField("How is it done? What should you look out for?", text: $model.exerciseDescription, axis: .vertical)
                        .lineLimit(4...12)
                } header: {
                    Text("Description")
                } footer: {
                    HStack(alignment: .top) {
                        if let problem = model.descriptionProblem {
                            ProblemText(problem)
                        }
                        Spacer()
                        Text(verbatim: "\(model.exerciseDescription.trimmingCharacters(in: .whitespacesAndNewlines).unicodeScalars.count)/\(CreateExerciseViewModel.maxDescriptionLength)")
                            .monospacedDigit()
                    }
                }

                musclesSection
                detailsSection
                metricSection

                if isEditing {
                    Section {
                        Button(role: .destructive) {
                            model.requestDeletion()
                        } label: {
                            Label("Delete exercise", systemImage: "trash")
                                .foregroundStyle(.red)
                        }
                    }
                }
            }
            .navigationTitle(isEditing ? "Edit exercise" : "New exercise")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        if model.save() {
                            dismiss()
                        }
                    }
                    .fontWeight(.semibold)
                }
            }
        }
        .alert("You can't delete this exercise", isPresented: Binding(get: { model.nonDeletableReason != nil }, set: { if !$0 { model.nonDeletableReason = nil } })) {
            Button("Got it", role: .cancel) {}
        } message: {
            Text(model.nonDeletableReason ?? "")
        }
        .alert("Delete this exercise?", isPresented: $model.showsDeleteConfirmation) {
            Button("Delete", role: .destructive) {
                model.delete()
                dismiss()
                deletedExercise = true
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("It can't be recovered.")
        }
        .confirmationDialog("Muscle group", isPresented: $model.showsMuscleGroupDialog, titleVisibility: .visible) {
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
                MusclePickerView(title: "Main muscles", allMuscles: allMuscles, selected: $model.primaryMuscles, other: $model.secondaryMuscles)
            case .secondary:
                MusclePickerView(title: "Secondary muscles", allMuscles: allMuscles, selected: $model.secondaryMuscles, other: $model.primaryMuscles)
            }
        }
        .task(id: model.selectedPhotos) {
            await model.loadSelectedPhotos()
        }
        .onAppear {
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

    // MARK: - Images

    private var imagesSection: some View {
        @Bindable var model = model
        // read here, the label of the photos picker isn't isolated to the main actor
        let imageCount = model.imageCount
        return Section {
            ExerciseImagesView(
                images: ExerciseImageItem.items(imageUrls: model.imageUrls, pendingImages: model.photos.map { (id: $0.id.uuidString, data: $0.data) }),
                showsTrailing: model.imageCount < Exercise.maxImages,
                onRemove: model.removeImage
            ) {
                Image(systemName: "photo")
                    .font(.largeTitle)
                    .foregroundStyle(.secondary)
            } trailing: {
                PhotosPicker(selection: $model.selectedPhotos, maxSelectionCount: max(1, Exercise.maxImages - model.imageCount), matching: .images, photoLibrary: .shared()) {
                    VStack(spacing: 8) {
                        Image(systemName: "photo.badge.plus")
                            .font(.largeTitle)
                        Text(imageCount > 0 ? "Add more images" : "Add images")
                            .font(.subheadline.weight(.medium))
                        if imageCount == 0 {
                            Text("e.g. one per step of the movement")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .foregroundStyle(userSettings.appColor)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .contentShape(Rectangle())
                }
                .accessibilityLabel("Add images")
            }
            .aspectRatio(imageCount == 0 ? 2 : 1, contentMode: .fit)
            .frame(maxWidth: .infinity)
            .background(Color(.tertiarySystemFill))
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)
        } header: {
            Text("Images · \(imageCount)/\(Exercise.maxImages)")
        }
    }

    // MARK: - Aliases

    // Other names like "Military press" for "Barbell shoulder press", so that the exercise is found by them
    private var aliasSection: some View {
        @Bindable var model = model
        return Section {
            if !model.aliases.isEmpty {
                FlowLayout(spacing: 6) {
                    ForEach(model.aliases, id: \.self) { alias in
                        Button {
                            withAnimation(.snappy(duration: 0.2)) { model.removeAlias(alias) }
                        } label: {
                            HStack(spacing: 4) {
                                Text(alias)
                                Image(systemName: "xmark")
                                    .font(.caption2.weight(.bold))
                                    .foregroundStyle(.secondary)
                            }
                            .font(.subheadline)
                            .foregroundStyle(Color.primary)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 5)
                            .background(Color(.tertiarySystemFill), in: Capsule())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Remove \(alias)")
                    }
                }
                .padding(.vertical, 4)
            }
            if model.aliases.count < CreateExerciseViewModel.maxAliasCount {
                HStack {
                    TextField("Add another name", text: $model.newAlias)
                        .autocorrectionDisabled()
                        .submitLabel(.done)
                        .onSubmit(addAlias)
                        .foregroundStyle(model.aliasProblem != nil ? Color.red : Color.primary)
                    Button(action: addAlias) {
                        Image(systemName: "plus.circle.fill")
                            .font(.title3)
                    }
                    .buttonStyle(.borderless)
                    .disabled(model.trimmedNewAlias.isEmpty || model.aliasProblem != nil)
                    .accessibilityLabel("Add name")
                }
            }
        } header: {
            Text("Also known as")
        } footer: {
            if let problem = model.aliasProblem {
                ProblemText(problem)
            } else {
                Text("Only used to find the exercise when searching.")
            }
        }
    }

    private func addAlias() {
        withAnimation(.snappy(duration: 0.2)) { model.addAlias() }
    }

    // MARK: - Muscles

    private var musclesSection: some View {
        Section {
            HStack(spacing: 16) {
                HighlightedBodyView(primaryMuscles: model.primaryMuscles, secondaryMuscles: model.secondaryMuscles)
                    .frame(height: 170)
                VStack(alignment: .leading, spacing: 12) {
                    MuscleLegend(color: MuscleLegend.primaryColor, title: "Main", muscles: model.primaryMuscles)
                    MuscleLegend(color: MuscleLegend.secondaryColor, title: "Also", muscles: model.secondaryMuscles)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.vertical, 4)

            Button {
                model.musclePicker = .primary
            } label: {
                FormValueRow(title: "Main muscles", systemImage: "", iconColor: MuscleLegend.primaryColor, value: count(model.primaryMuscles))
            }
            Button {
                model.musclePicker = .secondary
            } label: {
                FormValueRow(title: "Secondary muscles", systemImage: "", iconColor: MuscleLegend.secondaryColor, value: count(model.secondaryMuscles))
            }
        } header: {
            Text("Muscles")
        }
    }

    private func count(_ muscles: [Muscle]) -> String {
        muscles.isEmpty ? "None" : "\(muscles.count)"
    }

    // MARK: - Details

    private var detailsSection: some View {
        Section {
            Button {
                model.showsMuscleGroupDialog = true
            } label: {
                FormValueRow(title: "Muscle group", systemImage: "figure.strengthtraining.traditional", value: model.muscleGroup?.name ?? "Select", isMissing: model.missingSelectionWarning && model.muscleGroup == nil)
            }
            Button {
                model.showsEquipmentDialog = true
            } label: {
                FormValueRow(title: "Equipment", systemImage: "dumbbell", value: model.equipment?.name ?? "Select", isMissing: model.missingSelectionWarning && model.equipment == nil)
            }
        } header: {
            Text("Details")
        }
    }

    // MARK: - Tracked values

    private var metricSection: some View {
        Section {
            FlowLayout(spacing: 8) {
                ForEach(SetMetric.allCases, id: \.self) { metric in
                    let selected = model.trackedMetrics.contains(metric)
                    Button {
                        model.toggle(metric)
                    } label: {
                        HStack(spacing: 4) {
                            if selected {
                                Image(systemName: "checkmark")
                                    .font(.caption.weight(.bold))
                            }
                            Text(metric.name)
                        }
                        .font(.subheadline.weight(.medium))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .foregroundStyle(selected ? userSettings.appColorForeground : Color.primary)
                        .background(selected ? userSettings.appColor : Color(.tertiarySystemFill), in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .disabled(!model.canChangeTrackedMetrics)
                    .accessibilityAddTraits(selected ? .isSelected : [])
                }
            }
            .padding(.vertical, 4)
        } header: {
            Text("Tracked per set")
                .foregroundStyle(model.missingSelectionWarning && model.trackedMetrics.isEmpty ? Color.red : Color.secondary)
        } footer: {
            if !model.canChangeTrackedMetrics {
                Text("You have already done a workout with this exercise, so the tracked values can't be changed.")
            } else if model.missingSelectionWarning && model.trackedMetrics.isEmpty {
                ProblemText("Select at least one value.")
            }
        }
    }
}

/// A row of the form that opens a choice, with the chosen value on the right, red while it's missing
private struct FormValueRow: View {

    let title: String
    let systemImage: String
    var iconColor: Color? = nil
    let value: String
    var isMissing = false

    @Environment(UserSettings.self) private var userSettings

    var body: some View {
        HStack {
            Label {
                Text(title)
                    .foregroundStyle(isMissing ? Color.red : Color.primary)
            } icon: {
                if let iconColor {
                    // the dot of the muscle legend
                    Circle()
                        .fill(iconColor)
                        .frame(width: 10, height: 10)
                } else {
                    Image(systemName: systemImage)
                        .foregroundStyle(userSettings.appColor)
                }
            }
            Spacer()
            Text(value)
                .foregroundStyle(isMissing ? Color.red : Color.secondary)
                .lineLimit(1)
            Image(systemName: "chevron.right")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(Color(.tertiaryLabel))
        }
        .contentShape(Rectangle())
    }
}

/// A problem of the input below its field
private struct ProblemText: View {

    let text: String

    init(_ text: String) {
        self.text = text
    }

    var body: some View {
        Label(text, systemImage: "exclamationmark.circle.fill")
            .foregroundStyle(.red)
    }
}

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
