//
//  ExerciseHistoryCard.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 05.11.2026.
//

import SwiftUI

/// The past times an exercise was done as a card, the newest first: the date, the workout and every set, with the set
/// of the personal record highlighted. In the exercise stats and while the exercise is done in a workout.
struct ExerciseHistoryCard: View {

    typealias RecordSet = (workoutExercise: WorkoutExercise, index: Int)

    /// The newest first
    let workoutExercises: [WorkoutExercise]
    let record: RecordSet?
    /// In the workout in progress: the card takes the space it gets and its rows scroll inside it
    var scrolls = false

    @Environment(UserSettings.self) private var userSettings

    /// The set of the personal record, the first time it was done
    static func recordSet(of exercise: Exercise, in workoutExercises: [WorkoutExercise], summary: StatsSummary) -> RecordSet? {
        guard exercise.tracksWeights, let record = summary.personalRecord else { return nil }
        for workoutExercise in workoutExercises.reversed() {
            guard let weights = workoutExercise.weights else { continue }
            for index in weights.indices where weights[index] == record.weight && (workoutExercise.reps?[safe: index] ?? 0) == record.reps {
                return (workoutExercise, index)
            }
        }
        return nil
    }

    var body: some View {
        Group {
            if scrolls {
                ScrollView {
                    rows
                }
                .frame(maxHeight: .infinity, alignment: .top)
                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            } else {
                rows
            }
        }
        .cardBackground()
    }

    private var rows: some View {
        LazyVStack(spacing: 0) {
            ForEach(workoutExercises) { workoutExercise in
                HStack(alignment: .top) {
                    Text(formatDate(date: workoutExercise.workout?.date ?? .now))
                        .foregroundStyle(.secondary)
                    Spacer()
                    Text(workoutExercise.workout?.name ?? "")
                    Spacer()
                    VStack(alignment: .trailing) {
                        ForEach(0..<workoutExercise.entryCount, id: \.self) { set in
                            let isRecord = record?.workoutExercise == workoutExercise && record?.index == set
                            HStack(spacing: 4) {
                                if isRecord {
                                    Image(systemName: "trophy.fill")
                                        .font(.caption)
                                        .accessibilityLabel("Personal record")
                                }
                                Text(workoutExercise.entryDescription(at: set, weightUnit: userSettings.weightUnit, distanceUnit: userSettings.distanceUnit))
                                    .fontWeight(isRecord ? .semibold : .regular)
                            }
                            .foregroundStyle(isRecord ? userSettings.appColor : .primary)
                        }
                    }
                }
                .font(.subheadline)
                .padding(.vertical, 12)
                .padding(.horizontal)

                if workoutExercise != workoutExercises.last {
                    Divider()
                        .padding(.leading)
                }
            }
        }
    }
}
