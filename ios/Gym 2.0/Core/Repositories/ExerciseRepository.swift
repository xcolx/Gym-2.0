//
//  ExerciseRepository.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 22.10.2026.
//

import Foundation
import SwiftData

/// The exercises of the user and the verified ones, created and changed offline and pushed by the sync
@MainActor
struct ExerciseRepository: Repository {

    let context: ModelContext

    func isNameTaken(_ name: String, except exercise: Exercise?) -> Bool {
        fetch(FetchDescriptor<Exercise>()).contains { $0.name == name && $0 != exercise }
    }

    /// Stores a new exercise and saves it right away instead of with the next autosave, so that a crash or a freeze
    /// afterwards doesn't lose it
    func create(_ exercise: Exercise) {
        context.insert(exercise)
        saveLoggingErrors("the new exercise")
    }

    /// Saves the changes of an edited exercise right away
    func saveChanges(of exercise: Exercise) {
        saveLoggingErrors("the edited exercise")
    }

    /// Deleted here and, with the next sync, on the server
    func delete(_ exercise: Exercise) {
        context.deleteSynced(exercise)
        saveLoggingErrors("the deletion of an exercise")
    }
}
