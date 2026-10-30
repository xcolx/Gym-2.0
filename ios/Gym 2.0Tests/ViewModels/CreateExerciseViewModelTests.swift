//
//  CreateExerciseViewModelTests.swift
//  Gym 2.0Tests
//
//  Created by Colin Rüegg on 22.10.2026.
//
//  The input of CreateExerciseView: validation like the server, creating and editing exercises and the draft
//

import Foundation
import SwiftData
import Testing
@testable import Gym_2_0

@MainActor
@Suite struct CreateExerciseViewModelTests {

    let store: TestStore

    init() throws {
        store = try TestStore()
        store.insertReferenceData()
        store.context.insert(Equipment(serverId: 4, name: "Resistance Band"))
        try store.context.save()
    }

    var muscles: [Muscle] {
        ((try? store.context.fetchAll(Muscle.self)) ?? []).sorted { $0.serverId < $1.serverId }
    }

    func equipment(_ id: Int) -> Equipment {
        store.equipment.first { $0.serverId == id }!
    }

    func muscleGroup(_ id: Int) -> MuscleGroup {
        store.muscleGroups.first { $0.serverId == id }!
    }

    func model(editing exercise: Exercise? = nil) -> CreateExerciseViewModel {
        CreateExerciseViewModel(exercise: exercise, repository: ExerciseRepository(context: store.context))
    }

    /// A new exercise with everything that is needed
    func filledModel() -> CreateExerciseViewModel {
        let model = model()
        model.name = " Bench Press "
        model.muscleGroup = muscleGroup(1)
        model.select(equipment(1))
        return model
    }

    func exercises() throws -> [Exercise] {
        try store.context.fetchAll(Exercise.self)
    }

    // MARK: - Validation

    @Test func asksForTheMissingSelections() throws {
        let model = model()

        #expect(!model.save())

        #expect(model.missingSelectionWarning)
        #expect(model.nameProblem == "Enter a name.")
        #expect(try exercises().isEmpty)
    }

    @Test func refusesANameOfAnotherExercise() throws {
        store.exercise("Bench Press")
        let model = filledModel()

        #expect(!model.save())

        #expect(model.nameProblem == "Another exercise already has this name.")
        #expect(try exercises().count == 1)

        // typing again hides the warning
        model.name = "Bench Press 2"
        #expect(model.nameProblem == nil)
    }

    @Test func countsTheCharactersLikeTheServer() {
        let model = model()
        model.name = String(repeating: "💪", count: 26)
        // 26 scalars are fine, a flag consists of two
        #expect(model.nameProblem == nil)
        model.name = String(repeating: "🇨🇭", count: 26)
        #expect(model.nameProblem == "The name can be at most 50 characters long.")
        model.name = "Fine"
        model.exerciseDescription = String(repeating: "a", count: 1001)
        #expect(model.problem == "The description can be at most 1000 characters long.")
    }

    // MARK: - Creating

    @Test func createsTheExerciseWithTheTrimmedInput() throws {
        let model = filledModel()
        model.exerciseDescription = "  Lie on the bench.  "
        model.primaryMuscles = [muscles[0]]
        // in both lists, kept as primary
        model.secondaryMuscles = [muscles[0], muscles[1]]
        model.photos = [PickedExercisePhoto(data: Data([1, 2, 3]))]
        model.newAlias = " Flat Bench "

        #expect(model.save())

        let exercise = try #require(try exercises().first)
        #expect(exercise.name == "Bench Press")
        #expect(exercise.exerciseDescription == "Lie on the bench.")
        #expect(exercise.aliases == ["Flat Bench"])
        #expect(exercise.muscleGroupId == 1)
        #expect(exercise.equipmentId == 1)
        #expect(exercise.primaryMuscleIds == [1])
        #expect(exercise.secondaryMuscleIds == [2])
        #expect(exercise.trackedMetrics == [.reps, .weights])
        #expect(exercise.pendingImages == [Data([1, 2, 3])])
        #expect(exercise.syncState == .created)
        // saved right away
        #expect(!store.context.hasChanges)
    }

    @Test func tracksOnlyTheRepsOfResistanceBands() {
        let model = model()
        model.select(equipment(4))
        #expect(model.trackedMetrics == [.reps])
        model.select(equipment(1))
        #expect(model.trackedMetrics == [.reps, .weights])

        // the metrics the user picked stay
        model.toggle(.time)
        model.select(equipment(4))
        #expect(model.trackedMetrics == [.reps, .weights, .time])
    }

    @Test func needsATrackedMetric() {
        let model = filledModel()
        model.toggle(.reps)
        model.toggle(.weights)

        #expect(!model.save())
        #expect(model.missingSelectionWarning)
    }

    // MARK: - Aliases

    @Test func ignoresAliasesThatAreThereAlready() {
        let model = filledModel()
        model.newAlias = "Flat Bench"
        model.addAlias()
        model.newAlias = "flat bench"
        model.addAlias()
        // the name itself
        model.newAlias = "bench press"
        model.addAlias()
        model.newAlias = "   "
        model.addAlias()

        #expect(model.aliases == ["Flat Bench"])
        #expect(model.newAlias.isEmpty)

        model.removeAlias("Flat Bench")
        #expect(model.aliases.isEmpty)
    }

    @Test func leavesOutAliasesThatBecameTheName() throws {
        let model = filledModel()
        model.newAlias = "Chest Press"
        model.addAlias()
        model.name = "chest press"

        #expect(model.save())

        #expect(try exercises().first?.aliases == [])
    }

    // MARK: - Editing and deleting

    @Test func marksAnEditedExerciseForTheSync() throws {
        let exercise = store.exercise("Squat", serverId: 7, aliases: ["Back Squat"], muscleGroupId: 2, equipmentId: 1, primaryMuscleIds: [4])
        try store.context.save()
        let model = model(editing: exercise)
        model.onAppear(muscleGroups: store.muscleGroups, muscles: muscles, equipment: store.equipment)
        #expect(model.name == "Squat")
        #expect(model.aliases == ["Back Squat"])
        #expect(model.muscleGroup?.serverId == 2)
        #expect(model.primaryMuscles.map(\.serverId) == [4])

        model.name = "Front Squat"
        #expect(model.save())

        #expect(exercise.name == "Front Squat")
        #expect(exercise.syncState == .updated)
        #expect(!store.context.hasChanges)
    }

    @Test func keepsTheNameOfTheEditedExerciseItself() throws {
        let exercise = store.exercise("Squat", muscleGroupId: 2)
        let model = model(editing: exercise)
        model.onAppear(muscleGroups: store.muscleGroups, muscles: muscles, equipment: store.equipment)

        #expect(model.save())
        #expect(!model.nameTakenWarning)
    }

    @Test func explainsWhyAnExerciseCantBeDeleted() {
        let exercise = store.exercise("Squat")
        store.workout(exercises: [(exercise, Sets(reps: [5], weights: [100]))])
        let model = model(editing: exercise)

        model.requestDeletion()

        #expect(model.nonDeletableReason == "You have already done a workout with this exercise. Therefore it can't be deleted.")
        #expect(!model.showsDeleteConfirmation)
        #expect(!model.canChangeTrackedMetrics)
    }

    @Test func asksBeforeDeletingAnUnusedExercise() {
        let model = model(editing: store.exercise("Squat"))

        model.requestDeletion()

        #expect(model.nonDeletableReason == nil)
        #expect(model.showsDeleteConfirmation)
    }

    // MARK: - Draft

    @Test func continuesTheDraft() {
        let draft = CreateExerciseDraft(
            name: "Dips",
            aliases: ["Bar Dips"],
            newAlias: "Parallel",
            exerciseDescription: "Lower yourself.",
            muscleGroupId: 1,
            primaryMuscleIds: [2],
            secondaryMuscleIds: [1, 99],
            equipmentId: 3,
            photos: [Data([7])],
            trackedMetrics: [SetMetric.reps.draftKey],
            metricsChangedByUser: true
        )
        let model = model()

        model.apply(draft, muscleGroups: store.muscleGroups, muscles: muscles, equipment: store.equipment)

        #expect(model.name == "Dips")
        #expect(model.newAlias == "Parallel")
        #expect(model.muscleGroup?.serverId == 1)
        #expect(model.equipment?.serverId == 3)
        #expect(model.primaryMuscles.map(\.serverId) == [2])
        // a muscle that doesn't exist anymore is left out
        #expect(model.secondaryMuscles.map(\.serverId) == [1])
        #expect(model.trackedMetrics == [.reps])
        #expect(model.metricsChangedByUser)
        #expect(model.photos.map(\.data) == [Data([7])])

        let saved = model.currentDraft
        #expect(saved.name == "Dips")
        #expect(saved.secondaryMuscleIds == [1])
        #expect(saved.equipmentId == 3)
    }

    @Test func removesKeptAndNewImages() {
        let model = model()
        model.imageUrls = ["a", "b"]
        model.photos = [PickedExercisePhoto(data: Data([1]))]
        #expect(model.imageCount == 3)

        model.removeImage(at: 2)
        model.removeImage(at: 0)

        #expect(model.imageUrls == ["b"])
        #expect(model.photos.isEmpty)
    }
}

extension GlobalStateTests {

    /// Deleting uses the pending deletions in the UserDefaults
    @MainActor
    @Suite struct CreateExerciseDeletionTests {

        let globalState = GlobalStateSnapshot()
        let store: TestStore

        init() throws {
            store = try TestStore()
        }

        @Test func deletesTheExerciseAlsoOnTheServer() throws {
            let exercise = store.exercise("Squat", serverId: 7)
            try store.context.save()
            let model = CreateExerciseViewModel(exercise: exercise, repository: ExerciseRepository(context: store.context))

            model.delete()

            #expect(try store.context.fetchAll(Exercise.self).isEmpty)
            #expect(!store.context.hasChanges)
            #expect(PendingDeletions.all.contains { $0.serverId == 7 })
        }
    }
}
