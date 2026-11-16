//
//  WorkoutShareImage.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 16.11.2026.
//
//  What the image shows that the share button of a past workout shares. It is drawn by WorkoutShareImageView.
//

import Foundation

struct WorkoutShareImageContent {

    // The list of the exercises, in the points of the image. The exercises fill the columns from top to bottom, a
    // column is only added when the ones before are full. An exercise is never split, and with at most `maxLines`
    // lines at least four exercises fit in a column.
    static let maxColumns = 3
    static let columnHeight: CGFloat = 568
    /// The line with the name of an exercise
    static let nameHeight: CGFloat = 28
    /// A line with a set
    static let lineHeight: CGFloat = 20
    /// Between two exercises
    static let gap: CGFloat = 14
    /// The most lines under the name of an exercise, the last one is "+ 3 more" if it has more sets
    static let maxLines = 5

    struct ExerciseLine: Equatable {
        /// The position in the workout, from 1
        let number: Int
        let name: String
        /// Its sets, e.g. "10x, 60.0 kg"
        let lines: [String]

        var height: CGFloat {
            WorkoutShareImageContent.nameHeight + CGFloat(lines.count) * WorkoutShareImageContent.lineHeight
        }
    }

    let name: String
    /// e.g. "Monday, 12 October 2026 at 18:30"
    let date: String
    /// The totals next to the body, without the date
    let lines: [(title: String, value: String)]
    /// The first exercises in the order of the workout, by column: 0...3 columns, as many as they need
    let columns: [[ExerciseLine]]
    /// The number of exercises that didn't fit
    let moreExercises: Int

    /// - Parameter summaryLines: the lines of the overview of the workout, the date is left out
    init(workout: Workout, summaryLines: [(title: String, value: String)], weightUnit: UnitSystem, distanceUnit: UnitSystem) {
        let exercises = workout.workoutExercises.sorted { $0.index < $1.index }.enumerated().map { index, workoutExercise in
            let entries = (0..<workoutExercise.entryCount).map {
                workoutExercise.entryDescription(at: $0, weightUnit: weightUnit, distanceUnit: distanceUnit)
            }
            return ExerciseLine(number: index + 1, name: workoutExercise.exercise?.name ?? "", lines: Self.setLines(entries))
        }

        var columns: [[ExerciseLine]] = []
        var shown = 0
        for exercise in exercises {
            if let column = columns.last, Self.height(of: column) + Self.gap + exercise.height <= Self.columnHeight {
                columns[columns.count - 1].append(exercise)
            } else if columns.count < Self.maxColumns {
                columns.append([exercise])
            } else {
                break
            }
            shown += 1
        }

        name = workout.name
        date = workout.date.formatted(.dateTime.weekday(.wide).day().month(.wide).year().hour().minute())
        lines = summaryLines.filter { $0.title != "Date" }
        self.columns = columns
        moreExercises = exercises.count - shown
    }

    /// The lines under the name of an exercise: its sets, or the first ones and how many are left out
    static func setLines(_ entries: [String]) -> [String] {
        guard entries.count > maxLines else { return entries }
        return entries.prefix(maxLines - 1) + ["+ \(entries.count - (maxLines - 1)) more"]
    }

    /// The height of the exercises of a column with the gaps between them
    static func height(of column: [ExerciseLine]) -> CGFloat {
        column.map(\.height).reduce(0, +) + gap * CGFloat(max(column.count - 1, 0))
    }

    /// "+ 1 more exercise", nil if all exercises are shown
    var moreExercisesText: String? {
        guard moreExercises > 0 else { return nil }
        return moreExercises == 1 ? "+ 1 more exercise" : "+ \(moreExercises) more exercises"
    }

    /// The name of the shared file: the name of the workout without the characters a file name can't have
    var fileName: String {
        let forbidden = CharacterSet(charactersIn: "\\/:*?\"<>|").union(.controlCharacters)
        let name = self.name
            .components(separatedBy: forbidden)
            .joined(separator: " ")
            .split(whereSeparator: \.isWhitespace)
            .joined(separator: " ")
        return "\(name.isEmpty ? "Workout" : name).png"
    }
}
