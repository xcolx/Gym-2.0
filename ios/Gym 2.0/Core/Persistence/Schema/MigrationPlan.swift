//
//  MigrationPlan.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 17.02.2025.
//

import Foundation
import OSLog
import SwiftData

enum MyMigrationPlan: SchemaMigrationPlan {
    static var schemas: [any VersionedSchema.Type] {
        [VersionedSchemaV1.self, VersionedSchemaV2.self, VersionedSchemaV3.self]
    }
    
    static var stages: [MigrationStage] {
        [migrateV1toV2, migrateV2toV3]
    }
    
    static let migrateV1toV2 = MigrationStage.custom(
        fromVersion: VersionedSchemaV1.self,
        toVersion: VersionedSchemaV2.self,
        willMigrate: nil){ context in
            
            let gymAIChat = VersionedSchemaV2.Chat(name: "Gym-AI")
            context.insert(gymAIChat)
            try? context.save()
        }

    // V2 data cannot be converted, since V3 references server ids. Workouts, schemes and exercises are written
    // to a file for a later import, chats, messages and friends are dropped. The store is emptied before the
    // schema changes, so that no V2 row has to be mapped to V3.
    static let migrateV2toV3 = MigrationStage.custom(
        fromVersion: VersionedSchemaV2.self,
        toVersion: VersionedSchemaV3.self,
        willMigrate: { context in

            // If a previous attempt already wrote the file, the store may already be empty
            if try LegacyV2Data.read() == nil {
                let legacyData = try LegacyV2Data(context: context)
                Logger.legacyImport.info("Legacy data: \(legacyData.workouts.count) workouts, \(legacyData.schemes.count) schemes, \(legacyData.exercises.count) exercises")
                if !legacyData.isEmpty {
                    try legacyData.write()
                }
            }

            // Children first, since their relationships to the parents are not optional
            try context.delete(model: VersionedSchemaV2.WorkoutExercise.self)
            try context.delete(model: VersionedSchemaV2.Workout.self)
            try context.delete(model: VersionedSchemaV2.ExerciseWithIndex.self)
            try context.delete(model: VersionedSchemaV2.WorkoutScheme.self)
            try context.delete(model: VersionedSchemaV2.Message.self)
            try context.delete(model: VersionedSchemaV2.Chat.self)
            try context.delete(model: VersionedSchemaV2.Friend.self)
            try context.delete(model: VersionedSchemaV2.Exercise.self)
            try context.save()
        },
        didMigrate: nil
    )
}
