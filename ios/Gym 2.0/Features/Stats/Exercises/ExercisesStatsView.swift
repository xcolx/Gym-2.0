//
//  ExercisesStatsView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 27.08.2024.
//

import SwiftUI
import SwiftData

/// The order of the exercises in the stats
enum ExerciseStatsSort: String, CaseIterable, Identifiable {
    case name = "Name"
    case mostDone = "Most done"
    case lastDone = "Last done"

    var id: String { rawValue }
}

/// The exercises done in the finished workouts, with how often and when they were last done
struct ExercisesStatsView: View {

    @Query(
        filter: #Predicate <Workout> {$0.inProgress == false}
    ) var workouts: [Workout]

    @State var searchText = ""
    @AppStorage("exerciseStatsSort") private var sort: ExerciseStatsSort = .name
    /// Calculated once when shown and when the workouts change, not on every key of the search
    @State private var rows: [ExerciseStatsRow] = []

    private var shownRows: [ExerciseStatsRow] {
        // Same fuzzy search as the exercise list, best match first
        if !searchText.isEmpty {
            return FuzzySearch.filter(rows, query: searchText) { $0.exercise.searchNames }
        }
        switch sort {
        case .name: return rows.sorted { $0.exercise.name < $1.exercise.name }
        case .mostDone: return rows.sorted { $0.workoutCount != $1.workoutCount ? $0.workoutCount > $1.workoutCount : $0.exercise.name < $1.exercise.name }
        case .lastDone: return rows.sorted { $0.lastDate > $1.lastDate }
        }
    }

    var body: some View {
        List {
            ForEach(shownRows) { row in
                NavigationLink(value: StatsRoute.exercise(row.exercise)) {
                    VStack(alignment: .leading, spacing: 2) {
                        ExerciseNameText(name: row.exercise.name, verified: row.exercise.verified)
                        Text("\(row.workoutCount == 1 ? "1 workout" : "\(row.workoutCount) workouts") · \(row.lastDate.formatted(.dateTime.day().month()))")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .navigationTitle("Exercises")
        .searchable(text: $searchText)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Picker("Sort by", selection: $sort) {
                        ForEach(ExerciseStatsSort.allCases) { sort in
                            Text(sort.rawValue).tag(sort)
                        }
                    }
                } label: {
                    Label("Sort", systemImage: "arrow.up.arrow.down")
                }
            }
        }
        .overlay{
            if rows.isEmpty {
                ContentUnavailableView("No exercises yet", systemImage: "dumbbell", description: Text("The exercises of your finished workouts show up here."))
            } else if shownRows.isEmpty {
                ContentUnavailableView.search
            }
        }
        .onAppear(perform: calculateRows)
        .onChange(of: workouts) { calculateRows() }
    }

    private func calculateRows() {
        var workoutExercisesByExercise: [PersistentIdentifier: (exercise: Exercise, items: [WorkoutExercise])] = [:]
        for workout in workouts {
            for workoutExercise in workout.workoutExercises {
                guard let exercise = workoutExercise.exercise else { continue }
                workoutExercisesByExercise[exercise.persistentModelID, default: (exercise, [])].items.append(workoutExercise)
            }
        }
        rows = workoutExercisesByExercise.values.map { exercise, items in
            ExerciseStatsRow(
                exercise: exercise,
                workoutCount: Set(items.compactMap { $0.workout?.persistentModelID }).count,
                lastDate: items.compactMap { $0.workout?.date }.max() ?? .distantPast
            )
        }
    }
}

/// An exercise in the list of the stats
struct ExerciseStatsRow: Identifiable {
    let exercise: Exercise
    let workoutCount: Int
    let lastDate: Date

    var id: PersistentIdentifier { exercise.persistentModelID }
}
