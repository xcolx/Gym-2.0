//
//  WorkoutScheme+Helpers.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 05.10.2026.
//

import Foundation
import SwiftData

extension WorkoutScheme {
    
    // Without the exercises that were deleted, e.g. by a sync, but are still referenced until the context saves:
    // reading them crashes
    var sortedExercises: [Exercise] {
        exercises.sorted { $0.index < $1.index }.compactMap(\.exercise).filter { !$0.isGone }
    }
    
    // Replaces the complete exercise list, like the server does on an update. The existing rows are updated in place
    // (like apply(_:exercises:) of the sync): deleting them and creating new ones for the same exercises lost the
    // exercise of the new rows.
    func replaceExercises(with newExercises: [Exercise], context: ModelContext) {
        var rows = exercises.sorted { $0.index < $1.index }
        while rows.count > newExercises.count {
            context.delete(rows.removeLast())
        }
        for (index, exercise) in newExercises.enumerated() {
            if index < rows.count {
                rows[index].exercise = exercise
                rows[index].index = index
            } else {
                rows.append(WorkoutSchemeExercise(scheme: self, exercise: exercise, index: index))
            }
        }
        exercises = rows
        if syncState == .synced {
            syncState = .updated
        }
    }
}
