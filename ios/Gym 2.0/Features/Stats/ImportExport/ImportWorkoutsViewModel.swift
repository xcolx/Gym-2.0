//
//  ImportWorkoutsViewModel.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 21.07.2025.
//

import Foundation
import Observation
import UniformTypeIdentifiers

@MainActor
@Observable
final class ImportWorkoutsViewModel {
    var showImporter: Bool = false
    // the file importer is shown for the legacy import, the CSV of earlier versions with the exercises matched by name
    var isLegacyImport: Bool = false
    var importedWorkouts: [Workout] = []
    var showConfirmation: Bool = false
    var importError: String?
    var numImported: Int = 0
    // exercises of the file that do not exist, they are not imported
    var missingExerciseNames: [String] = []
    // workouts of the file that exist already, e.g. when a file is imported twice
    var numExisting: Int = 0
    // workouts of the file with values the server doesn't accept, they are not imported
    var invalidWorkouts: [String] = []
    // the result of the legacy import, nil for the import of a Gym 2.0 file
    var legacyResult: LegacyWorkoutImport.Result?

    // the workouts of the file are matched against the stored exercises and workouts, and stored there
    @ObservationIgnored private let workouts: WorkoutRepository

    init(workouts: WorkoutRepository) {
        self.workouts = workouts
    }

    /// The files of the export (JSON or CSV) and the CSV files of earlier versions
    static let allowedContentTypes: [UTType] = [.json, .commaSeparatedText, .text, UTType(filenameExtension: "csv")].compactMap { $0 }
    /// The CSV files of earlier versions, for the legacy import
    static let legacyContentTypes: [UTType] = [.commaSeparatedText, .text, UTType(filenameExtension: "csv")].compactMap { $0 }

    func selectFile(legacy: Bool) {
        isLegacyImport = legacy
        showImporter = true
    }

    func importFile(url: URL) {
        guard url.startAccessingSecurityScopedResource() else {
            self.importError = "Couldn't access file (security-scoped resource problem)."
            return
        }
        defer { url.stopAccessingSecurityScopedResource() }

        do {
            importData(try Data(contentsOf: url), pathExtension: url.pathExtension)
        } catch {
            self.importError = error.localizedDescription
        }
    }

    /// Reads the content of the picked file and asks to confirm its new workouts
    func importData(_ data: Data, pathExtension: String) {
        importError = nil
        missingExerciseNames = []
        numExisting = 0
        invalidWorkouts = []
        legacyResult = nil

        do {
            let file: WorkoutFile
            if isLegacyImport {
                guard let text = String(data: data, encoding: .utf8) else {
                    self.importError = "Could not read the file."
                    return
                }
                file = try WorkoutFile(legacyCSV: text)
            } else if pathExtension.lowercased() == "json" || data.first(where: { !Character(UnicodeScalar($0)).isWhitespace }) == UInt8(ascii: "{") {
                file = try WorkoutFile(json: data)
            } else if let text = String(data: data, encoding: .utf8) {
                file = try WorkoutFile(csv: text)
            } else {
                self.importError = "Could not read the file."
                return
            }

            let result: WorkoutFile.ImportResult
            if isLegacyImport {
                let legacyResult = try LegacyWorkoutImport.makeWorkouts(file, context: workouts.context)
                self.legacyResult = legacyResult
                result = legacyResult.importResult
            } else {
                result = try file.makeWorkouts(context: workouts.context)
            }
            self.importedWorkouts = result.workouts
            self.numImported = result.workouts.count
            self.missingExerciseNames = result.missingExerciseNames
            self.numExisting = result.existingCount
            self.invalidWorkouts = result.invalidWorkouts
            if result.workouts.isEmpty {
                self.importError = "The file doesn't contain any new workouts."
            } else {
                self.showConfirmation = true
            }
        } catch {
            self.importError = error.localizedDescription
        }
    }

    func confirmImport() {
        workouts.insert(importedWorkouts)
        importedWorkouts.removeAll()
        numImported = 0
    }
}
