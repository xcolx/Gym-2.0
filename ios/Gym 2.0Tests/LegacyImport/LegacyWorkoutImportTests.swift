//
//  LegacyWorkoutImportTests.swift
//  Gym 2.0Tests
//
//  Created by Colin Rüegg on 21.10.2026.
//
//  The import of the CSV files of earlier versions. Mirrors web/src/lib/domain/legacy-workout-import.test.ts
//

import Foundation
import Testing
@testable import Gym_2_0

@MainActor
struct LegacyWorkoutImportTests {

    let store: TestStore
    let exercises: [Exercise]

    init() throws {
        store = try TestStore()
        exercises = [
            store.exercise("Dumbbell Shrug", serverId: 1, verified: true),
            store.exercise("Lat Pulldown", serverId: 2, verified: true),
            store.exercise("Pull-Up", serverId: 3, verified: true),
            store.exercise("Crunches", serverId: 4, verified: true),
            store.exercise("Hip Abduction", serverId: 5, verified: true),
            store.exercise("Hip Adduction Machine", serverId: 6, verified: true),
            store.exercise("Barbell Shoulder Press", serverId: 7, aliases: ["Military Press"], verified: true),
        ]
    }

    func matches(_ names: Set<String>, in exercises: [Exercise]? = nil) -> [String: String] {
        LegacyWorkoutImport.match(names, exercises: exercises ?? self.exercises).mapValues(\.name)
    }

    // MARK: Matching names

    @Test func matchesPluralsPunctuationSpacesWordOrderPrefixesAndAliases() {
        #expect(matches(["Dumbbell Shrugs", "Lat Pull Down", "Pull Ups", "Crunch", "Press Military", "Shrug Dumbbell"]) == [
            "Dumbbell Shrugs": "Dumbbell Shrug",
            "Lat Pull Down": "Lat Pulldown",
            "Pull Ups": "Pull-Up",
            "Crunch": "Crunches",
            "Press Military": "Barbell Shoulder Press",
            "Shrug Dumbbell": "Dumbbell Shrug",
        ])
    }

    @Test func matchesTheSameNameAndIgnoresCaseAndDiacritics() {
        #expect(matches(["Hip Abduction", "hip ábduction", "LAT PULLDOWN"]) == [
            "Hip Abduction": "Hip Abduction",
            "hip ábduction": "Hip Abduction",
            "LAT PULLDOWN": "Lat Pulldown",
        ])
    }

    @Test func doesntTolerateTyposOrExtraWords() {
        #expect(matches(["Hip Abduction Machine", "Steinheben (Swiss)", "Shrug"]).isEmpty)
    }

    @Test func prefersTheVerifiedExerciseIfACustomOneHasTheSameName() {
        let custom = store.exercise("Dumbbell Shrug", verified: false)
        let result = LegacyWorkoutImport.match(["Dumbbell Shrugs", "Dumbbell Shrug"], exercises: [custom, exercises[0]])
        #expect(result["Dumbbell Shrugs"]?.verified == true)
        #expect(result["Dumbbell Shrug"]?.verified == true)
    }

    @Test func onlyMatchesLooselyIfExactlyOneExerciseDoes() {
        let crunchy = store.exercise("Crunchy", verified: true)
        // "Crunch" is the beginning of both names
        #expect(matches(["Crunch"], in: [exercises[3], crunchy]).isEmpty)
        #expect(matches(["Crunch"], in: [exercises[3]]) == ["Crunch": "Crunches"])
        // Short words have to match completely, "Lat" isn't "Lateral"
        let lateral = store.exercise("Lateral Raise", verified: true)
        #expect(matches(["Lat Raise"], in: [lateral]).isEmpty)
    }

    // MARK: The legacy CSV

    static let legacyCSV = """
        ID; Name; Date; Time; Exercise; Unilateral; Reps; Weight; Index
        0C42E389-4BF8-4B6F-A990-9274EEB84CB3;Pull;2026-10-03 14:30:45 +0000;98;Lat Pull Down;false;[12, 10];[60.0, 60.0];1
        0C42E389-4BF8-4B6F-A990-9274EEB84CB3;Pull;2026-10-03 14:30:45 +0000;98;Dumbbell Shrugs;true;[9, 9];[23.0, 23.0];0
        D6AE2CC8-E1A3-4977-958D-0A0344CAB8F2;Stones;2026-10-01 17:26:45 +0000;117;Steinheben (Swiss);false;[7];[60.0];0
        D6AE2CC8-E1A3-4977-958D-0A0344CAB8F2;Stones;2026-10-01 17:26:45 +0000;117;Pull Ups;false;[7];[80.0];1

        """

    @Test func readsTheLegacyCSV() throws {
        let file = try WorkoutFile(legacyCSV: Self.legacyCSV)
        #expect(file.workouts.count == 2)
        let pull = file.workouts[0]
        #expect(pull.id == UUID(uuidString: "0C42E389-4BF8-4B6F-A990-9274EEB84CB3"))
        #expect(pull.name == "Pull")
        #expect(pull.date == isoDate("2026-10-03T14:30:45Z"))
        #expect(pull.durationMinutes == 98)
        // sorted by the index column
        #expect(pull.exercises.map(\.exercise) == ["Dumbbell Shrugs", "Lat Pull Down"])
        let shrugs = pull.exercises[0]
        #expect(shrugs.unilateral)
        #expect(shrugs.sets.map(\.side) == ["R", "L"])
        #expect(shrugs.sets.map(\.reps) == [9, 9])
        #expect(shrugs.sets.map(\.weight) == [23, 23])
        #expect(pull.exercises[1].sets.map(\.side) == [nil, nil])
        // The general CSV import reads it as well
        #expect(try WorkoutFile(csv: Self.legacyCSV).workouts.count == 2)
    }

    @Test func importsOnlyTheWorkoutsOfWhichEveryExerciseIsMatched() throws {
        let result = try LegacyWorkoutImport.makeWorkouts(WorkoutFile(legacyCSV: Self.legacyCSV), context: store.context)
        #expect(result.totalCount == 2)
        #expect(result.importResult.workouts.count == 1)
        let workout = try #require(result.importResult.workouts.first)
        #expect(workout.name == "Pull")
        #expect(!workout.inProgress)
        #expect(workout.sortedWorkoutExercises.map { $0.exercise?.name } == ["Dumbbell Shrug", "Lat Pulldown"])
        #expect(workout.sortedWorkoutExercises[0].unilateral)
        #expect(workout.sortedWorkoutExercises[0].reps == [9, 9])
        #expect(result.unmatchedExerciseNames == ["Steinheben (Swiss)"])
        #expect(result.unmatchedWorkoutCount == 1)
        #expect(result.renamedExercises.map { "\($0.legacyName) → \($0.exerciseName)" } == [
            "Dumbbell Shrugs → Dumbbell Shrug",
            "Lat Pull Down → Lat Pulldown",
            "Pull Ups → Pull-Up",
        ])
    }

    @Test func skipsWorkoutsThatWereImportedBefore() throws {
        store.workout("Pull", date: isoDate("2026-10-03T14:30:45Z"))
        let result = try LegacyWorkoutImport.makeWorkouts(WorkoutFile(legacyCSV: Self.legacyCSV), context: store.context)
        #expect(result.importResult.workouts.isEmpty)
        #expect(result.importResult.existingCount == 1)
    }

    @Test func rejectsFilesOfThisVersion() {
        let error = #expect(throws: WorkoutFileError.self) {
            try WorkoutFile(legacyCSV: "Workout ID;Workout;Date\n")
        }
        #expect(error?.localizedDescription == "This is not a CSV file exported from an earlier version of Gym 2.0.")
        #expect(throws: WorkoutFileError.self) {
            try WorkoutFile(legacyCSV: "")
        }
    }
}
