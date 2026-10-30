//
//  CreateExerciseDraft.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 16.10.2026.
//

import Foundation

/// The input of an exercise that is being created, written to a file when the app goes to the background. The system
/// may end the app in the background, which would lose the input, so `MainView` opens the create view again with it.
/// Whether it is restored is decided by the scene storage of `MainView`: it is discarded when the user closes the
/// app in the app switcher, like the input was before.
struct CreateExerciseDraft: Codable, Identifiable {
    var id = UUID()
    var name: String
    var aliases: [String]
    var newAlias: String
    var exerciseDescription: String
    var muscleGroupId: Int?
    var primaryMuscleIds: [Int]
    var secondaryMuscleIds: [Int]
    var equipmentId: Int?
    // the images picked but not uploaded yet, already scaled down
    var photos: [Data]
    var trackedMetrics: [String]
    var metricsChangedByUser: Bool

    /// Whether the create view of a new exercise is open, MainView stores it when the app goes to the background
    static var isOpen = false

    private static var fileURL: URL {
        URL.applicationSupportDirectory.appending(path: "CreateExerciseDraft.json")
    }

    static func load() -> CreateExerciseDraft? {
        guard let data = try? Data(contentsOf: fileURL) else { return nil }
        return try? JSONDecoder().decode(CreateExerciseDraft.self, from: data)
    }

    func save() {
        try? FileManager.default.createDirectory(at: URL.applicationSupportDirectory, withIntermediateDirectories: true)
        try? JSONEncoder().encode(self).write(to: Self.fileURL, options: .atomic)
    }

    /// When the create view is closed or saved, and when the app starts without a draft to restore
    static func remove() {
        try? FileManager.default.removeItem(at: fileURL)
    }
}

extension SetMetric {
    /// The name in the draft
    var draftKey: String { String(describing: self) }

    init?(draftKey: String) {
        guard let metric = Self.allCases.first(where: { $0.draftKey == draftKey }) else { return nil }
        self = metric
    }
}
