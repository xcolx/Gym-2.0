//
//  LegacyV2DataExport.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 05.10.2026.
//

import Foundation

/// Writes the legacy V2 data to files the user can keep when it can't be imported:
/// a JSON file with everything (including the images of custom exercises) and a CSV file with one row per set.
enum LegacyV2DataExport {

    private static let directory = URL.temporaryDirectory.appending(path: "LegacyExport", directoryHint: .isDirectory)

    static func write() throws -> [URL] {
        try? FileManager.default.removeItem(at: directory)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)

        let jsonURL = directory.appending(path: "Gym 2.0 Old Data.json")
        guard let data = try LegacyV2Data.read() else { return [] }

        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        try encoder.encode(data).write(to: jsonURL, options: .atomic)

        let csvURL = directory.appending(path: "Gym 2.0 Old Workouts.csv")
        try workoutsCSV(data).write(to: csvURL, atomically: true, encoding: .utf8)

        return [jsonURL, csvURL]
    }

    private static func workoutsCSV(_ data: LegacyV2Data) -> String {
        var rows = [["Date", "Workout", "Duration (min)", "Exercise", "Unilateral", "Set", "Reps", "Weight"]]

        for workout in data.workouts.sorted(by: { $0.date < $1.date }) {
            let date = workout.date.ISO8601Format()
            for exercise in workout.exercises.sorted(by: { $0.index < $1.index }) {
                let setCount = max(exercise.reps.count, exercise.weights.count)
                if setCount == 0 {
                    rows.append([date, workout.name, String(workout.duration), exercise.exerciseName, String(exercise.unilateral), "", "", ""])
                }
                for set in 0..<setCount {
                    rows.append([
                        date, workout.name, String(workout.duration), exercise.exerciseName, String(exercise.unilateral), String(set + 1),
                        exercise.reps.indices.contains(set) ? String(exercise.reps[set]) : "",
                        exercise.weights.indices.contains(set) ? String(exercise.weights[set]) : "",
                    ])
                }
            }
        }
        return rows.map { $0.map(escaped).joined(separator: ",") }.joined(separator: "\n") + "\n"
    }

    private static func escaped(_ field: String) -> String {
        guard field.contains(where: { ",\"\n\r".contains($0) }) else { return field }
        return "\"" + field.replacingOccurrences(of: "\"", with: "\"\"") + "\""
    }
}
