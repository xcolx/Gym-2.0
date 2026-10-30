//
//  Repository.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 22.10.2026.
//
//  The view models read and write the SwiftData store through the repositories instead of using the ModelContext
//  directly. Views keep @Query for their live lists.
//

import Foundation
import OSLog
import SwiftData

/// A small wrapper around a ModelContext for the models of one kind
@MainActor
protocol Repository {
    var context: ModelContext { get }
}

extension Repository {

    func save() throws {
        try context.save()
    }

    /// Saves right away instead of with the next autosave, so that a crash afterwards doesn't lose the change. The user
    /// can't do anything about a failure, so it's only logged: the changes stay in the context and the autosave tries
    /// again.
    func saveLoggingErrors(_ change: String) {
        do {
            try context.save()
        } catch {
            Logger.persistence.error("Saving \(change, privacy: .public) failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// The same model in this context, e.g. an exercise picked in another context. Nil if it isn't stored.
    func sameModel<Model: PersistentModel>(as model: Model) -> Model? {
        context.model(for: model.persistentModelID) as? Model
    }

    /// The models matching the descriptor, empty (and logged) if the fetch failed
    func fetch<Model: PersistentModel>(_ descriptor: FetchDescriptor<Model>) -> [Model] {
        do {
            return try context.fetch(descriptor)
        } catch {
            Logger.persistence.error("Fetching \(String(describing: Model.self), privacy: .public) failed: \(error.localizedDescription, privacy: .public)")
            return []
        }
    }
}
