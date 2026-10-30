//
//  CreateExerciseViewModel.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 22.10.2026.
//

import Foundation
import Observation
import PhotosUI
import SwiftUI

/// The input of CreateExerciseView, its validation (the limits of the server) and saving or deleting the exercise
@MainActor
@Observable
final class CreateExerciseViewModel {

    // The limits of the server, see backend/app/schemas/exercises.py
    static let maxNameLength = 50
    static let maxDescriptionLength = 1000
    static let maxAliasCount = 20
    static let maxAliasLength = 50

    /// The edited exercise, nil to create a new one
    let exercise: Exercise?
    /// The input of a new exercise to continue, after the system ended the app in the background
    @ObservationIgnored private let draft: CreateExerciseDraft?
    @ObservationIgnored private let repository: ExerciseRepository

    var name = "" {
        didSet {
            if name != oldValue { nameTakenWarning = false }
        }
    }
    /// Other names, only used by the search
    var aliases: [String] = []
    var newAlias = ""
    var exerciseDescription = ""
    var muscleGroup: MuscleGroup?
    var primaryMuscles: [Muscle] = []
    var secondaryMuscles: [Muscle] = []
    var equipment: Equipment?
    /// The uploaded images that are kept, followed by the new ones
    var imageUrls: [String] = []
    var photos: [PickedExercisePhoto] = []
    var selectedPhotos: [PhotosPickerItem] = []
    var trackedMetrics: Set<SetMetric> = [.reps, .weights]
    /// Until the user picks the metrics, they follow the equipment
    var metricsChangedByUser = false
    var nameTakenWarning = false
    var missingSelectionWarning = false

    var showsMuscleGroupDialog = false
    var showsEquipmentDialog = false
    /// The muscles being picked in the sheet
    var musclePicker: MuscleRole? = nil
    /// Why the exercise can't be deleted, nil if it can
    var nonDeletableReason: String? = nil
    var showsDeleteConfirmation = false

    init(exercise: Exercise?, draft: CreateExerciseDraft? = nil, repository: ExerciseRepository) {
        self.exercise = exercise
        self.draft = draft
        self.repository = repository
    }

    // MARK: - Lifecycle

    /// Fills the fields with the edited exercise or the draft. The reference data resolves the IDs of the draft.
    func onAppear(muscleGroups: [MuscleGroup], muscles: [Muscle], equipment: [Equipment]) {
        guard let exercise else {
            CreateExerciseDraft.isOpen = true
            if let draft {
                apply(draft, muscleGroups: muscleGroups, muscles: muscles, equipment: equipment)
            }
            return
        }
        name = exercise.name
        aliases = exercise.aliases
        exerciseDescription = exercise.exerciseDescription ?? ""
        muscleGroup = exercise.muscleGroup
        primaryMuscles = exercise.primaryMuscles
        secondaryMuscles = exercise.secondaryMuscles
        self.equipment = exercise.equipment
        trackedMetrics = Set(exercise.trackedMetrics)

        imageUrls = exercise.imageUrls
        photos = exercise.pendingImages.map { PickedExercisePhoto(data: $0) }
    }

    /// The system may end the app in the background, MainView then opens the view again with the draft
    func didEnterBackground() {
        if exercise == nil {
            currentDraft.save()
        }
    }

    func onDisappear() {
        guard exercise == nil else { return }
        CreateExerciseDraft.isOpen = false
        CreateExerciseDraft.remove()
    }

    var currentDraft: CreateExerciseDraft {
        CreateExerciseDraft(
            name: name,
            aliases: aliases,
            newAlias: newAlias,
            exerciseDescription: exerciseDescription,
            muscleGroupId: muscleGroup?.serverId,
            primaryMuscleIds: primaryMuscles.map(\.serverId),
            secondaryMuscleIds: secondaryMuscles.map(\.serverId),
            equipmentId: equipment?.serverId,
            photos: photos.map(\.data),
            trackedMetrics: trackedMetrics.map(\.draftKey),
            metricsChangedByUser: metricsChangedByUser
        )
    }

    func apply(_ draft: CreateExerciseDraft, muscleGroups: [MuscleGroup], muscles: [Muscle], equipment: [Equipment]) {
        name = draft.name
        aliases = draft.aliases
        newAlias = draft.newAlias
        exerciseDescription = draft.exerciseDescription
        muscleGroup = muscleGroups.first { $0.serverId == draft.muscleGroupId }
        primaryMuscles = draft.primaryMuscleIds.compactMap { id in muscles.first { $0.serverId == id } }
        secondaryMuscles = draft.secondaryMuscleIds.compactMap { id in muscles.first { $0.serverId == id } }
        self.equipment = equipment.first { $0.serverId == draft.equipmentId }
        photos = draft.photos.map { PickedExercisePhoto(data: $0) }
        trackedMetrics = Set(draft.trackedMetrics.compactMap(SetMetric.init(draftKey:)))
        metricsChangedByUser = draft.metricsChangedByUser
    }

    // MARK: - Selections

    func select(_ equipment: Equipment) {
        self.equipment = equipment
        // like in V2, the weight is not tracked for resistance bands
        if exercise == nil && !metricsChangedByUser {
            trackedMetrics = equipment.name == "Resistance Band" ? [.reps] : [.reps, .weights]
        }
    }

    func toggle(_ metric: SetMetric) {
        metricsChangedByUser = true
        if trackedMetrics.contains(metric) {
            trackedMetrics.remove(metric)
        } else {
            trackedMetrics.insert(metric)
        }
    }

    /// The set data of performed workouts depends on the tracked metrics, so they are fixed once the exercise was performed
    var canChangeTrackedMetrics: Bool {
        exercise?.canChangeTrackedMetrics ?? true
    }

    // MARK: - Images

    var imageCount: Int {
        imageUrls.count + photos.count
    }

    func removeImage(at index: Int) {
        if index < imageUrls.count {
            imageUrls.remove(at: index)
        } else {
            photos.remove(at: index - imageUrls.count)
        }
    }

    /// Adds the picked photos, as many as there is room for
    func loadSelectedPhotos() async {
        guard !selectedPhotos.isEmpty else { return }
        for item in selectedPhotos where imageCount < Exercise.maxImages {
            // scaled down in the background, it takes a moment for big photos
            if let data = try? await item.loadTransferable(type: Data.self),
               let prepared = await Task.detached(operation: { ExerciseImageUpload.prepared(data) }).value {
                photos.append(PickedExercisePhoto(data: prepared))
            }
        }
        selectedPhotos = []
    }

    // MARK: - Validation

    var trimmedName: String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var trimmedDescription: String {
        exerciseDescription.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    // The server counts the characters as unicode scalars, an emoji can be several
    var nameProblem: String? {
        if trimmedName.unicodeScalars.count > Self.maxNameLength {
            return "The name can be at most \(Self.maxNameLength) characters long."
        }
        if missingSelectionWarning && trimmedName.isEmpty {
            return "Enter a name."
        }
        if nameTakenWarning {
            return "Another exercise already has this name."
        }
        return nil
    }

    var trimmedNewAlias: String {
        newAlias.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var aliasProblem: String? {
        guard trimmedNewAlias.unicodeScalars.count > Self.maxAliasLength else { return nil }
        return "Another name can be at most \(Self.maxAliasLength) characters long."
    }

    var descriptionProblem: String? {
        guard trimmedDescription.unicodeScalars.count > Self.maxDescriptionLength else { return nil }
        return "The description can be at most \(Self.maxDescriptionLength) characters long."
    }

    /// The first problem of the input, shown below the name
    var problem: String? {
        nameProblem ?? aliasProblem ?? descriptionProblem
    }

    // MARK: - Aliases

    // Names that are already there are ignored, like the server does
    func addAlias() {
        let alias = trimmedNewAlias
        guard aliasProblem == nil, aliases.count < Self.maxAliasCount else { return }
        if !alias.isEmpty && !isSameName(alias, trimmedName) && !aliases.contains(where: { isSameName($0, alias) }) {
            aliases.append(alias)
        }
        newAlias = ""
    }

    func removeAlias(_ alias: String) {
        aliases.removeAll { $0 == alias }
    }

    private func isSameName(_ first: String, _ second: String) -> Bool {
        first.caseInsensitiveCompare(second) == .orderedSame
    }

    // MARK: - Saving and deleting

    /// Saves the exercise if the input is valid. Returns whether it was saved, the view is closed then.
    func save() -> Bool {
        let name = trimmedName
        nameTakenWarning = repository.isNameTaken(name, except: exercise)

        guard let muscleGroup, let equipment, !trackedMetrics.isEmpty, !name.isEmpty else {
            missingSelectionWarning = true
            return false
        }
        // a name that was typed but not added yet
        addAlias()
        guard nameProblem == nil, aliasProblem == nil, descriptionProblem == nil else { return false }

        let description: String? = trimmedDescription.isEmpty ? nil : trimmedDescription
        // the name may have changed since an alias was added
        let aliases = aliases.filter { !isSameName($0, name) }
        // exercises saved before a muscle could only be in one list may still have it in both
        let secondaryMuscles = secondaryMuscles.filter { !primaryMuscles.contains($0) }

        guard !nameTakenWarning else { return false }

        if let exercise {
            exercise.name = name
            exercise.aliases = aliases
            exercise.exerciseDescription = description
            if canChangeTrackedMetrics {
                exercise.tracksReps = trackedMetrics.contains(.reps)
                exercise.tracksWeights = trackedMetrics.contains(.weights)
                exercise.tracksTime = trackedMetrics.contains(.time)
                exercise.tracksIntensity = trackedMetrics.contains(.intensity)
                exercise.tracksDistance = trackedMetrics.contains(.distance)
            }
            exercise.muscleGroupId = muscleGroup.serverId
            exercise.primaryMuscleIds = primaryMuscles.map(\.serverId)
            exercise.secondaryMuscleIds = secondaryMuscles.map(\.serverId)
            exercise.equipmentId = equipment.serverId
            let pendingImages = photos.map(\.data)
            if exercise.imageUrls != imageUrls {
                exercise.imageUrls = imageUrls
            }
            if exercise.pendingImages != pendingImages {
                exercise.pendingImages = pendingImages
            }
            if exercise.syncState == .synced {
                exercise.syncState = .updated
            }
            repository.saveChanges(of: exercise)
        } else {
            let exercise = Exercise(
                name: name,
                aliases: aliases,
                exerciseDescription: description,
                muscleGroupId: muscleGroup.serverId,
                equipmentId: equipment.serverId,
                primaryMuscleIds: primaryMuscles.map(\.serverId),
                secondaryMuscleIds: secondaryMuscles.map(\.serverId),
                tracksReps: trackedMetrics.contains(.reps),
                tracksWeights: trackedMetrics.contains(.weights),
                tracksTime: trackedMetrics.contains(.time),
                tracksIntensity: trackedMetrics.contains(.intensity),
                tracksDistance: trackedMetrics.contains(.distance)
            )
            exercise.pendingImages = photos.map(\.data)
            repository.create(exercise)
        }
        return true
    }

    /// Like the server, an exercise can't be deleted while a workout or a workout scheme contains it
    func requestDeletion() {
        if exercise?.workoutExercises.isEmpty == false {
            nonDeletableReason = "You have already done a workout with this exercise. Therefore it can't be deleted."
        } else if exercise?.schemeExercises.isEmpty == false {
            nonDeletableReason = "This exercise is part of a workout scheme. Remove it from the scheme first to delete it."
        } else {
            showsDeleteConfirmation = true
        }
    }

    /// Deletes the edited exercise, also on the server with the next sync
    func delete() {
        if let exercise {
            repository.delete(exercise)
        }
    }
}
