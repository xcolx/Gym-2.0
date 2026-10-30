//
//  LegacyWorkoutImport.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 21.10.2026.
//

import Foundation
import SwiftData

/// The legacy import: the CSV of earlier versions, with its exercises matched to the current exercises by name, since
/// many names changed slightly ("Dumbbell Shrugs" → "Dumbbell Shrug", "Lat Pull Down" → "Lat Pulldown").
/// Only workouts of which every exercise is matched are imported.
///
/// An exercise matches if it has the same name, or if its name or one of its aliases has the same words ignoring case,
/// diacritics, punctuation, plurals, their order and the spaces between them. Otherwise, a name matches if every word
/// of both names is the beginning of a word of the other name ("Crunch" → "Crunches"), if exactly one exercise does.
/// Typos aren't tolerated, so that e.g. "Hip Abduction" never becomes "Hip Adduction".
enum LegacyWorkoutImport {

    struct Result {
        var importResult: WorkoutFile.ImportResult
        /// All workouts of the file
        var totalCount: Int
        /// The exercises that were matched to an exercise with another name, sorted by the name in the file
        var renamedExercises: [(legacyName: String, exerciseName: String)]
        /// The exercises of the file without a match, the workouts with them are left out
        var unmatchedExerciseNames: [String]
        /// Workouts that are left out, since one of their exercises has no match
        var unmatchedWorkoutCount: Int
    }

    /// Creates the workouts of the file with the matched exercises without inserting them, see `makeWorkouts`
    static func makeWorkouts(_ file: WorkoutFile, context: ModelContext) throws -> Result {
        let exercises = try context.fetchAll(Exercise.self).filter { $0.syncState != .deleted }
        let names = Set(file.workouts.flatMap { $0.exercises.map(\.exercise) })
        let matches = match(names, exercises: exercises)

        let matchedWorkouts = file.workouts.filter { workout in
            workout.exercises.allSatisfy { matches[$0.exercise] != nil }
        }
        // The file with the names of the matched exercises, the exact match of makeWorkouts finds them
        var matchedFile = file
        matchedFile.workouts = matchedWorkouts.map { workout in
            var workout = workout
            for index in workout.exercises.indices {
                workout.exercises[index].exercise = matches[workout.exercises[index].exercise]!.name
            }
            return workout
        }

        return Result(
            importResult: try matchedFile.makeWorkouts(context: context),
            totalCount: file.workouts.count,
            renamedExercises: matches
                .filter { $0.key != $0.value.name }
                .map { (legacyName: $0.key, exerciseName: $0.value.name) }
                .sorted { $0.legacyName.localizedCaseInsensitiveCompare($1.legacyName) == .orderedAscending },
            unmatchedExerciseNames: names.filter { matches[$0] == nil }.sorted(),
            unmatchedWorkoutCount: file.workouts.count - matchedWorkouts.count
        )
    }

    /// The exercise of every name of the file that matches one, verified exercises win over custom ones
    static func match(_ names: Set<String>, exercises: [Exercise]) -> [String: Exercise] {
        let sorted = exercises.sorted { $0.verified && !$1.verified }
        var byName: [String: Exercise] = [:]
        var byKey: [String: Exercise] = [:]
        for exercise in sorted where byName[exercise.name] == nil {
            byName[exercise.name] = exercise
        }
        // The shown names before the aliases, so that an alias never wins over another exercise's name
        let passes: [(Exercise) -> [String]] = [{ [$0.name] }, { $0.aliases }]
        for exerciseNames in passes {
            for exercise in sorted {
                for key in exerciseNames(exercise).flatMap(keys(of:)) where !key.isEmpty && byKey[key] == nil {
                    byKey[key] = exercise
                }
            }
        }

        var matches: [String: Exercise] = [:]
        for name in names {
            if let match = byName[name] ?? keys(of: name).lazy.compactMap({ byKey[$0] }).first {
                matches[name] = match
                continue
            }
            let loose = sorted.filter { exercise in
                exercise.searchNames.contains { namesMatchLoosely(name, $0) }
            }
            // Only if it's clear which one, a verified exercise wins over custom ones
            let candidates = loose.contains(where: \.verified) ? loose.filter(\.verified) : loose
            if candidates.count == 1 {
                matches[name] = candidates[0]
            }
        }
        return matches
    }

    /// Lowercased words without diacritics and plural "s", split at everything that is no letter or number
    private static func words(of text: String) -> [String] {
        text.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: nil)
            .lowercased()
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { !$0.isEmpty }
            .map { $0.count >= 3 && $0.hasSuffix("s") && !$0.hasSuffix("ss") ? String($0.dropLast()) : $0 }
    }

    /// The same words in any order, or the same letters with other spaces ("Pull Up" and "Pullup")
    private static func keys(of name: String) -> [String] {
        let nameWords = words(of: name)
        return [nameWords.sorted().joined(separator: " "), nameWords.joined()]
    }

    /// One word starts with the other one, which isn't much shorter
    private static func wordsMatch(_ a: String, _ b: String) -> Bool {
        let (shorter, longer) = a.count <= b.count ? (a, b) : (b, a)
        return longer.hasPrefix(shorter) && (shorter.count >= 4 || shorter.count == longer.count)
    }

    private static func namesMatchLoosely(_ a: String, _ b: String) -> Bool {
        let aWords = words(of: a)
        let bWords = words(of: b)
        guard !aWords.isEmpty, !bWords.isEmpty else { return false }
        return aWords.allSatisfy { word in bWords.contains { wordsMatch(word, $0) } }
            && bWords.allSatisfy { word in aWords.contains { wordsMatch(word, $0) } }
    }
}
