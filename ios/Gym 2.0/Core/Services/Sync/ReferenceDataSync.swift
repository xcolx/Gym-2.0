//
//  ReferenceDataSync.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 04.10.2026.
//

import Foundation
import SwiftData

/// Pulls the muscles, muscle groups and equipment. They only change on the server, every pull loads all of them.
/// Used by `SyncService`.
@MainActor
final class ReferenceDataSync {

    private let context: ModelContext
    private let exerciseService: ExerciseService

    init(context: ModelContext, exerciseService: ExerciseService) {
        self.context = context
        self.exerciseService = exerciseService
    }

    func pull() async throws {
        let muscles = try await exerciseService.muscles()
        let muscleGroups = try await exerciseService.muscleGroups()
        let equipment = try await exerciseService.equipment()

        try replace(Muscle.self, with: muscles, id: \.serverId) { dto in
            Muscle(serverId: dto.id, name: dto.name, imageUrl: dto.imageUrl)
        } update: { $0.apply($1) }
        try replace(MuscleGroup.self, with: muscleGroups, id: \.serverId) { MuscleGroup(serverId: $0.id, name: $0.name) } update: { $0.apply($1) }
        try replace(Equipment.self, with: equipment, id: \.serverId) { Equipment(serverId: $0.id, name: $0.name) } update: { $0.apply($1) }
    }

    /// Makes the local reference data match the server's
    private func replace<Model: PersistentModel, DTO: Identifiable>(_ type: Model.Type, with dtos: [DTO], id: KeyPath<Model, Int>, create: (DTO) -> Model, update: (Model, DTO) -> Void) throws where DTO.ID == Int {
        var local = Dictionary(try context.fetchAll(Model.self).map { ($0[keyPath: id], $0) }, uniquingKeysWith: { first, _ in first })
        for dto in dtos {
            if let model = local.removeValue(forKey: dto.id) {
                update(model, dto)
            } else {
                context.insert(create(dto))
            }
        }
        local.values.forEach(context.delete)
    }
}
