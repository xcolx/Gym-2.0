//
//  WorkoutFile.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 13.10.2026.
//

import Foundation
import SwiftData

/// The finished workouts as an exported file, as JSON or CSV, and read back by the import.
///
/// Like the database, files always use kg, m and s, so they can be imported regardless of the unit settings.
/// Exercises are referenced by name, since the ids differ between accounts. Every entry of a set is listed:
/// unilateral exercises have a right ("R") and a left ("L") entry per set. A value is missing (nil, empty cell)
/// if the exercise doesn't track it.
struct WorkoutFile: Codable {

    static let formatName = "gym2-workouts"

    var format = Self.formatName
    var version = 1
    var units = Units()
    var workouts: [WorkoutEntry]

    struct Units: Codable {
        var weight = "kg"
        var distance = "m"
        var time = "s"
        var duration = "min"
    }

    struct WorkoutEntry: Codable {
        /// The client UUID of the workout when it was exported, so a workout that still exists isn't imported again.
        /// Imported workouts get a new UUID: the server keeps the UUIDs of deleted workouts and would return the
        /// deleted workout instead of creating it again.
        var id: UUID
        var name: String
        var date: Date
        var durationMinutes: Int
        var exercises: [ExerciseEntry]
    }

    struct ExerciseEntry: Codable {
        var exercise: String
        var unilateral: Bool
        var sets: [SetEntry]
    }

    struct SetEntry: Codable {
        /// "R" or "L" for unilateral exercises
        var side: String?
        var reps: Int?
        var weight: Double?
        var time: Int?
        var intensity: Double?
        var distance: Double?
    }
}

// MARK: - From the models

extension WorkoutFile {

    init(workouts: [Workout]) {
        self.workouts = workouts.sorted { $0.date < $1.date }.map { workout in
            WorkoutEntry(
                id: workout.clientUUID,
                name: workout.name,
                date: workout.date,
                durationMinutes: workout.duration,
                exercises: workout.sortedWorkoutExercises.map { workoutExercise in
                    ExerciseEntry(
                        exercise: workoutExercise.exercise?.name ?? "",
                        unilateral: workoutExercise.unilateral,
                        sets: (0..<workoutExercise.entryCount).map { index in
                            SetEntry(
                                side: workoutExercise.unilateral ? (index % 2 == 0 ? "R" : "L") : nil,
                                reps: workoutExercise.reps?[index],
                                weight: workoutExercise.weights?[index],
                                time: workoutExercise.time?[index],
                                intensity: workoutExercise.intensity?[index],
                                distance: workoutExercise.distance?[index]
                            )
                        }
                    )
                }
            )
        }
    }
}

// MARK: - JSON

extension WorkoutFile {

    func json() throws -> Data {
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return try encoder.encode(self)
    }

    init(json data: Data) throws {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        decoder.dateDecodingStrategy = .iso8601
        self = try decoder.decode(WorkoutFile.self, from: data)
        guard format == Self.formatName else {
            throw WorkoutFileError("This is not a Gym 2.0 workout file.")
        }
    }
}

// MARK: - CSV

extension WorkoutFile {

    /// One row per entry of a set, separated by semicolons
    private static let csvHeader = ["Workout ID", "Workout", "Date", "Duration (min)", "Exercise No.", "Exercise", "Unilateral", "Set", "Side", "Reps", "Weight (kg)", "Time (s)", "Intensity", "Distance (m)"]
    /// The header of the CSV files of earlier versions, with reps and weights as arrays per exercise
    private static let legacyCSVColumnCount = 9

    func csv() -> String {
        let dateFormatter = ISO8601DateFormatter()
        var rows = [Self.csvHeader]
        for workout in workouts {
            for (exerciseIndex, exercise) in workout.exercises.enumerated() {
                for (index, set) in exercise.sets.enumerated() {
                    rows.append([
                        workout.id.uuidString,
                        workout.name,
                        dateFormatter.string(from: workout.date),
                        "\(workout.durationMinutes)",
                        "\(exerciseIndex + 1)",
                        exercise.exercise,
                        exercise.unilateral ? "true" : "false",
                        "\(exercise.unilateral ? index / 2 + 1 : index + 1)",
                        set.side ?? "",
                        set.reps.map { "\($0)" } ?? "",
                        set.weight.map { UnitSystem.number($0, maxDecimals: 2) } ?? "",
                        set.time.map { "\($0)" } ?? "",
                        set.intensity.map { UnitSystem.number($0, maxDecimals: 2) } ?? "",
                        set.distance.map { UnitSystem.number($0, maxDecimals: 3) } ?? ""
                    ])
                }
            }
        }
        return rows.map { $0.map(Self.escape).joined(separator: ";") }.joined(separator: "\n") + "\n"
    }

    /// Reads the CSV of this version and the one of earlier versions
    init(csv text: String) throws {
        let rows = Self.parseCSV(text).filter { !$0.allSatisfy { $0.trimmingCharacters(in: .whitespaces).isEmpty } }
        guard let header = rows.first else {
            throw WorkoutFileError("The file is empty.")
        }
        if header.first?.trimmingCharacters(in: .whitespaces) == Self.csvHeader.first {
            workouts = try Self.workouts(fromRows: rows.dropFirst())
        } else if header.count == Self.legacyCSVColumnCount {
            workouts = Self.workouts(fromLegacyRows: rows.dropFirst())
        } else {
            throw WorkoutFileError("This is not a Gym 2.0 workout file.")
        }
    }

    /// Reads only the CSV of earlier versions, for the legacy import
    init(legacyCSV text: String) throws {
        let rows = Self.parseCSV(text).filter { !$0.allSatisfy { $0.trimmingCharacters(in: .whitespaces).isEmpty } }
        guard let header = rows.first else {
            throw WorkoutFileError("The file is empty.")
        }
        guard header.count == Self.legacyCSVColumnCount, header.first?.trimmingCharacters(in: .whitespaces) == "ID" else {
            throw WorkoutFileError("This is not a CSV file exported from an earlier version of Gym 2.0.")
        }
        workouts = Self.workouts(fromLegacyRows: rows.dropFirst())
    }

    private static func workouts(fromRows rows: ArraySlice<[String]>) throws -> [WorkoutEntry] {
        let dateFormatter = ISO8601DateFormatter()
        var workouts: [WorkoutEntry] = []
        // The exercise number of the last exercise of every workout, a new number starts a new exercise
        var lastExerciseNumber: [UUID: String] = [:]

        for (rowIndex, row) in rows.enumerated() {
            guard row.count == csvHeader.count else {
                throw WorkoutFileError("Row \(rowIndex + 2) doesn't have \(csvHeader.count) columns.")
            }
            let cell = { (index: Int) in row[index].trimmingCharacters(in: .whitespaces) }
            guard let id = UUID(uuidString: cell(0)), let date = dateFormatter.date(from: cell(2)) else {
                throw WorkoutFileError("Row \(rowIndex + 2) has an invalid workout id or date.")
            }

            if !workouts.contains(where: { $0.id == id }) {
                workouts.append(WorkoutEntry(id: id, name: cell(1), date: date, durationMinutes: Int(cell(3)) ?? 0, exercises: []))
            }
            let workoutIndex = workouts.firstIndex { $0.id == id }!
            if lastExerciseNumber[id] != cell(4) {
                lastExerciseNumber[id] = cell(4)
                workouts[workoutIndex].exercises.append(ExerciseEntry(exercise: cell(5), unilateral: cell(6).lowercased() == "true", sets: []))
            }
            let set = SetEntry(
                side: cell(8).isEmpty ? nil : cell(8),
                reps: Int(cell(9)),
                weight: Double(cell(10)),
                time: Int(cell(11)),
                intensity: Double(cell(12)),
                distance: Double(cell(13))
            )
            workouts[workoutIndex].exercises[workouts[workoutIndex].exercises.count - 1].sets.append(set)
        }
        return workouts
    }

    /// ID; Name; Date; Time; Exercise; Unilateral; Reps; Weight; Index, with reps and weights as "[10, 8]"
    private static func workouts(fromLegacyRows rows: ArraySlice<[String]>) -> [WorkoutEntry] {
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd HH:mm:ss Z"
        func numbers<Value>(_ text: String, _ convert: (String) -> Value?) -> [Value] {
            text.trimmingCharacters(in: CharacterSet(charactersIn: "[] ")).split(separator: ",").compactMap { convert($0.trimmingCharacters(in: .whitespaces)) }
        }

        var workouts: [WorkoutEntry] = []
        var exercisesByWorkout: [UUID: [(index: Int, entry: ExerciseEntry)]] = [:]
        for row in rows where row.count == legacyCSVColumnCount {
            let cells = row.map { $0.trimmingCharacters(in: .whitespaces) }
            let id = UUID(uuidString: cells[0]) ?? UUID()
            if !workouts.contains(where: { $0.id == id }) {
                workouts.append(WorkoutEntry(id: id, name: cells[1], date: dateFormatter.date(from: cells[2]) ?? .now, durationMinutes: Int(cells[3]) ?? 0, exercises: []))
            }
            let unilateral = Bool(cells[5]) ?? false
            let reps = numbers(cells[6]) { Int($0) }
            let weights = numbers(cells[7]) { Double($0) }
            let sets = (0..<max(reps.count, weights.count)).map { index in
                SetEntry(
                    side: unilateral ? (index % 2 == 0 ? "R" : "L") : nil,
                    reps: index < reps.count ? reps[index] : nil,
                    weight: index < weights.count ? weights[index] : nil
                )
            }
            exercisesByWorkout[id, default: []].append((Int(cells[8]) ?? 0, ExerciseEntry(exercise: cells[4], unilateral: unilateral, sets: sets)))
        }
        for index in workouts.indices {
            workouts[index].exercises = (exercisesByWorkout[workouts[index].id] ?? []).sorted { $0.index < $1.index }.map(\.entry)
        }
        return workouts
    }

    /// Quoted if it contains a separator, a quote or a line break
    private static func escape(_ field: String) -> String {
        guard field.contains(where: { $0 == ";" || $0 == "\"" || $0.isNewline }) else { return field }
        return "\"" + field.replacingOccurrences(of: "\"", with: "\"\"") + "\""
    }

    /// Rows of semicolon separated fields, fields can be quoted with double quotes
    private static func parseCSV(_ text: String) -> [[String]] {
        var rows: [[String]] = []
        var row: [String] = []
        var field = ""
        var isQuoted = false
        var characters = text.makeIterator()
        var pending: Character?

        while let character = pending ?? characters.next() {
            pending = nil
            if isQuoted {
                if character == "\"" {
                    let next = characters.next()
                    if next == "\"" {
                        field.append("\"")
                    } else {
                        isQuoted = false
                        pending = next
                    }
                } else {
                    field.append(character)
                }
            } else if character == "\"" && field.isEmpty {
                isQuoted = true
            } else if character == ";" {
                row.append(field)
                field = ""
            } else if character.isNewline {
                row.append(field)
                rows.append(row)
                row = []
                field = ""
            } else {
                field.append(character)
            }
        }
        if !field.isEmpty || !row.isEmpty {
            row.append(field)
            rows.append(row)
        }
        return rows
    }
}

// MARK: - To the models

extension WorkoutFile {

    struct ImportResult {
        var workouts: [Workout] = []
        /// Exercises of the file that don't exist, they are left out
        var missingExerciseNames: [String] = []
        /// Workouts that exist already, e.g. a file that is imported a second time
        var existingCount = 0
        /// Workouts with values the server doesn't accept, e.g. negative reps or more than 100 sets, they are left out
        var invalidWorkouts: [String] = []
    }

    /// The limits of the server, see backend/app/schemas/workouts.py
    private enum Limits {
        static let exercises = 100
        static let entries = 100
        static let duration = 0...1440
    }

    /// Creates the workouts of the file without inserting them. Values the exercise doesn't track are left out,
    /// tracked values missing in the file are 0.
    func makeWorkouts(context: ModelContext) throws -> ImportResult {
        let exercises = try context.fetchAll(Exercise.self).filter { $0.syncState != .deleted }
        // Verified exercises first, if a custom exercise has the same name
        var exercisesByName: [String: Exercise] = [:]
        for exercise in exercises.sorted(by: { $0.verified && !$1.verified }) where exercisesByName[exercise.name] == nil {
            exercisesByName[exercise.name] = exercise
        }
        let existingWorkouts = try context.fetchAll(Workout.self)
        let existingIds = Set(existingWorkouts.map(\.clientUUID))

        var result = ImportResult()
        var missing: Set<String> = []
        for entry in workouts {
            let name = String(entry.name.prefix(Workout.maxNameLength))
            // Exported from this account, or imported before and recognized by its name and start since it got a new UUID
            let exists = existingIds.contains(entry.id) || existingWorkouts.contains { $0.name == name && abs($0.date.timeIntervalSince(entry.date)) < 1 }
            guard !exists else {
                result.existingCount += 1
                continue
            }
            // Checked before any model is created, so nothing of a workout that is left out ends up in the context
            var exercisesToImport: [(entry: ExerciseEntry, exercise: Exercise, sets: [SetEntry])] = []
            for exerciseEntry in entry.exercises {
                guard let exercise = exercisesByName[exerciseEntry.exercise] else {
                    missing.insert(exerciseEntry.exercise)
                    continue
                }
                var sets = exerciseEntry.sets
                // A unilateral set always has a right and a left entry
                if exerciseEntry.unilateral && sets.count % 2 == 1 {
                    sets.append(SetEntry(side: "L"))
                }
                guard !sets.isEmpty else { continue }
                exercisesToImport.append((exerciseEntry, exercise, sets))
            }
            guard !exercisesToImport.isEmpty else { continue }
            let isValid = exercisesToImport.count <= Limits.exercises && exercisesToImport.allSatisfy { item in
                item.sets.count <= Limits.entries && item.sets.allSatisfy { $0.fits(item.exercise) }
            }
            guard isValid else {
                result.invalidWorkouts.append("\(name) (\(entry.date.formatted(date: .abbreviated, time: .omitted)))")
                continue
            }

            let duration = min(max(entry.durationMinutes, Limits.duration.lowerBound), Limits.duration.upperBound)
            let workout = Workout(name: name, date: entry.date, duration: duration, inProgress: false)
            for (exerciseEntry, exercise, sets) in exercisesToImport {
                let workoutExercise = WorkoutExercise(
                    workout: workout,
                    exercise: exercise,
                    unilateral: exerciseEntry.unilateral,
                    index: workout.workoutExercises.count,
                    reps: exercise.tracksReps ? sets.map { $0.reps ?? 0 } : nil,
                    weights: exercise.tracksWeights ? sets.map { $0.weight ?? 0 } : nil,
                    time: exercise.tracksTime ? sets.map { $0.time ?? 0 } : nil,
                    intensity: exercise.tracksIntensity ? sets.map { $0.intensity ?? 0 } : nil,
                    distance: exercise.tracksDistance ? sets.map { $0.distance ?? 0 } : nil
                )
                workout.workoutExercises.append(workoutExercise)
            }
            result.workouts.append(workout)
        }
        result.missingExerciseNames = missing.sorted()
        return result
    }
}

private extension WorkoutFile.SetEntry {
    /// Whether the server accepts the values the exercise tracks, a missing value is imported as 0
    func fits(_ exercise: Exercise) -> Bool {
        exercise.trackedMetrics.allSatisfy { metric in
            metric.serverRange.contains(value(of: metric) ?? 0)
        }
    }

    func value(of metric: SetMetric) -> Double? {
        switch metric {
        case .reps: reps.map(Double.init)
        case .weights: weight
        case .time: time.map(Double.init)
        case .intensity: intensity
        case .distance: distance
        }
    }
}

struct WorkoutFileError: LocalizedError {
    let errorDescription: String?

    init(_ message: String) {
        errorDescription = message
    }
}
