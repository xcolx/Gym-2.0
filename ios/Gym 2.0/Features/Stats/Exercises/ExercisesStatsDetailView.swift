//
//  ExercisesStatsDetailView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 10.09.2024.
//

import Charts
import SwiftUI
import SwiftData

/// The stats of one exercise: the totals, its progress over time, the personal record and every time it was done
struct ExercisesStatsDetailView: View {

    @State var exercise: Exercise
    @Environment(UserSettings.self) var userSettings

    @State var filteredPastWorkoutExercises: [WorkoutExercise] = []
    @State private var chartMetric: ExerciseChartMetric = .heaviest
    @State private var chartRange: ExerciseChartRange = .sixMonths

    // Sorted in onAppear: a SortDescriptor through the optional relationship (\WorkoutExercise.workout?.date)
    // crashes in release builds, SwiftData can't find the optimized key path
    @Query(
        filter: #Predicate <WorkoutExercise> {$0.workout?.inProgress == false}
    ) var workoutExercises: [WorkoutExercise]

    var body: some View {
        let summary = StatsCalculator.summary(of: filteredPastWorkoutExercises)
        let record = recordSet(summary)
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                if filteredPastWorkoutExercises.isEmpty {
                    ContentUnavailableView("Not done yet", systemImage: "dumbbell", description: Text("You have never done this exercise. You will see your past workouts with this exercise here."))
                        .padding(.top, 40)
                } else {
                    statTiles(summary)

                    if !ExerciseChartMetric.metrics(for: exercise).isEmpty {
                        chartCard
                    }

                    if let record, let personalRecord = summary.personalRecord {
                        recordCard(personalRecord, workoutExercise: record.workoutExercise)
                    }

                    history(record: record)
                }
            }
            .padding()
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle(exercise.name)
        .onAppear{
            // Computed once: as a computed property, cancelling updates the view again for a workout that doesn't
            // exist anymore
            self.filteredPastWorkoutExercises = workoutExercises.compactMap { workoutExercise in
                if workoutExercise.exercise == exercise {
                    return workoutExercise
                } else {
                    return nil
                }
            }
            .sorted { ($0.workout?.date ?? .distantPast) > ($1.workout?.date ?? .distantPast) }

            let metrics = ExerciseChartMetric.metrics(for: exercise)
            if !metrics.contains(chartMetric), let first = metrics.first {
                chartMetric = first
            }
        }
    }

    // MARK: - Totals

    // Only the values the exercise tracks
    private func statTiles(_ summary: StatsSummary) -> some View {
        let weightUnit = userSettings.weightUnit
        let distanceUnit = userSettings.distanceUnit
        var tiles: [(title: String, value: String)] = [
            ("Workouts", "\(summary.workouts)"),
            ("Sets", "\(summary.sets)"),
        ]
        if exercise.tracksReps {
            tiles.append(("Total reps", "\(Int(summary.reps.total))"))
            tiles.append(("Avg reps per set", average(summary.reps) { UnitSystem.number($0, maxDecimals: 1) }))
        }
        if exercise.tracksWeights {
            if exercise.tracksReps {
                tiles.append(("Volume", weightUnit.formatVolume(kilograms: summary.volume)))
            }
            tiles.append(("Personal record", summary.personalRecord.map { StatsSummary.formatRecord($0, unit: weightUnit) } ?? "–"))
        }
        if exercise.tracksTime {
            tiles.append(("Total time", StatsSummary.formatTime(seconds: summary.time.total)))
            tiles.append(("Avg time per set", average(summary.time) { StatsSummary.formatTime(seconds: $0) }))
            tiles.append(("Longest set", maximum(summary.time) { StatsSummary.formatTime(seconds: $0) }))
        }
        if exercise.tracksIntensity {
            tiles.append(("Avg intensity", average(summary.intensity, StatsSummary.formatIntensity)))
            tiles.append(("Highest intensity", maximum(summary.intensity, StatsSummary.formatIntensity)))
        }
        if exercise.tracksDistance {
            tiles.append(("Total distance", distanceUnit.formatDistance(meters: summary.distance.total)))
            tiles.append(("Avg distance per set", average(summary.distance) { distanceUnit.formatDistance(meters: $0) }))
            tiles.append(("Longest set", maximum(summary.distance) { distanceUnit.formatDistance(meters: $0) }))
        }

        return LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
            ForEach(Array(tiles.enumerated()), id: \.offset) { _, tile in
                VStack(alignment: .leading, spacing: 4) {
                    Text(tile.title)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                    Text(tile.value)
                        .font(.title3.bold())
                        .fontDesign(.rounded)
                        .monospacedDigit()
                        // large numbers shrink instead of wrapping out of the tile
                        .lineLimit(1)
                        .minimumScaleFactor(0.5)
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .cardBackground()
                .accessibilityElement(children: .combine)
            }
        }
    }

    // "–" if no value was entered yet
    func average(_ metric: StatsSummary.Metric, _ format: (Double) -> String) -> String {
        metric.average.map(format) ?? "–"
    }

    func maximum(_ metric: StatsSummary.Metric, _ format: (Double) -> String) -> String {
        metric.count > 0 ? format(metric.max) : "–"
    }

    // MARK: - Progress

    private var chartCard: some View {
        let metrics = ExerciseChartMetric.metrics(for: exercise)
        let start = chartRange.start(from: .now)
        let points = filteredPastWorkoutExercises
            .compactMap { workoutExercise -> (date: Date, value: Double)? in
                guard let date = workoutExercise.workout?.date, start.map({ date >= $0 }) ?? true,
                      let value = chartMetric.value(of: workoutExercise, weightUnit: userSettings.weightUnit, distanceUnit: userSettings.distanceUnit)
                else { return nil }
                return (date, value)
            }
            .sorted { $0.date < $1.date }

        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text("Progress")
                    .font(.headline)
                Spacer()
                Text(chartMetric.unit(weightUnit: userSettings.weightUnit, distanceUnit: userSettings.distanceUnit))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            if metrics.count > 1 {
                AppColorSegmentedPicker(options: metrics, selection: $chartMetric) { $0.title }
            }

            Group {
                if points.isEmpty {
                    Text("No values in this period.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    Chart(Array(points.enumerated()), id: \.offset) { _, point in
                        LineMark(x: .value("Date", point.date), y: .value(chartMetric.title, point.value))
                            .interpolationMethod(.monotone)
                        PointMark(x: .value("Date", point.date), y: .value(chartMetric.title, point.value))
                            .symbolSize(points.count > 30 ? 12 : 30)
                    }
                    .foregroundStyle(userSettings.appColor)
                    .chartYScale(domain: .automatic(includesZero: false))
                }
            }
            .frame(height: 180)

            AppColorSegmentedPicker(options: ExerciseChartRange.allCases, selection: $chartRange) { $0.rawValue }
        }
        .padding()
        .cardBackground()
    }

    // MARK: - Personal record

    /// The set of the personal record, the first time it was done
    private func recordSet(_ summary: StatsSummary) -> ExerciseHistoryCard.RecordSet? {
        ExerciseHistoryCard.recordSet(of: exercise, in: filteredPastWorkoutExercises, summary: summary)
    }

    private func recordCard(_ record: (weight: Double, reps: Int), workoutExercise: WorkoutExercise) -> some View {
        HStack(spacing: 14) {
            Image(systemName: "trophy.fill")
                .font(.title2)
                .foregroundStyle(userSettings.appColor)
                .frame(width: 44, height: 44)
                .background(userSettings.appColor.opacity(0.12), in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text("Personal record")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                Text(StatsSummary.formatRecord(record, unit: userSettings.weightUnit))
                    .font(.title3.bold())
                    .fontDesign(.rounded)
                if let workout = workoutExercise.workout {
                    Text("\(workout.name) · \(formatDate(date: workout.date))")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()
        }
        .padding()
        .cardBackground()
        .accessibilityElement(children: .combine)
    }

    // MARK: - History

    private func history(record: ExerciseHistoryCard.RecordSet?) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("History")
                .font(.title3.bold())
                .padding(.horizontal, 4)

            ExerciseHistoryCard(workoutExercises: filteredPastWorkoutExercises, record: record)
        }
    }
}

// MARK: - Chart

/// What the progress chart of an exercise shows, one value per time it was done
enum ExerciseChartMetric: String, Hashable, CaseIterable {
    case heaviest
    case volume
    case reps
    case time
    case intensity
    case distance

    var title: String {
        switch self {
        case .heaviest: "Heaviest"
        case .volume: "Volume"
        case .reps: "Reps"
        case .time: "Time"
        case .intensity: "Intensity"
        case .distance: "Distance"
        }
    }

    /// The metrics the exercise tracks
    static func metrics(for exercise: Exercise) -> [ExerciseChartMetric] {
        var metrics: [ExerciseChartMetric] = []
        if exercise.tracksWeights { metrics.append(.heaviest) }
        if exercise.tracksWeights && exercise.tracksReps { metrics.append(.volume) }
        if exercise.tracksReps { metrics.append(.reps) }
        if exercise.tracksTime { metrics.append(.time) }
        if exercise.tracksIntensity { metrics.append(.intensity) }
        if exercise.tracksDistance { metrics.append(.distance) }
        return metrics
    }

    func unit(weightUnit: UnitSystem, distanceUnit: UnitSystem) -> String {
        switch self {
        case .heaviest, .volume: weightUnit.weightSymbol
        case .reps: "reps"
        case .time: "min"
        case .intensity: "level"
        case .distance: distanceUnit.distanceSymbol
        }
    }

    /// In the units of the user, nil if no value was entered
    func value(of workoutExercise: WorkoutExercise, weightUnit: UnitSystem, distanceUnit: UnitSystem) -> Double? {
        let value: Double
        switch self {
        case .heaviest:
            value = weightUnit.weight(fromKilograms: workoutExercise.weights?.max() ?? 0)
        case .volume:
            value = weightUnit.weight(fromKilograms: workoutExercise.volume)
        case .reps:
            value = Double(workoutExercise.totalReps)
        case .time:
            value = Double(workoutExercise.time?.reduce(0, +) ?? 0) / 60
        case .intensity:
            let entered = (workoutExercise.intensity ?? []).filter { $0 != 0 }
            value = entered.isEmpty ? 0 : entered.reduce(0, +) / Double(entered.count)
        case .distance:
            value = distanceUnit.distance(fromMeters: workoutExercise.distance?.reduce(0, +) ?? 0)
        }
        return value > 0 ? value : nil
    }
}

/// The period the progress chart shows
enum ExerciseChartRange: String, Hashable, CaseIterable {
    case threeMonths = "3M"
    case sixMonths = "6M"
    case year = "1Y"
    case all = "All"

    /// Nil for all
    func start(from now: Date, calendar: Calendar = .current) -> Date? {
        switch self {
        case .threeMonths: calendar.date(byAdding: .month, value: -3, to: now)
        case .sixMonths: calendar.date(byAdding: .month, value: -6, to: now)
        case .year: calendar.date(byAdding: .year, value: -1, to: now)
        case .all: nil
        }
    }
}
