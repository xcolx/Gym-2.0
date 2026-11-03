//
//  PastWorkoutsView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 20.08.2024.
//

import SwiftUI
import SwiftData

/// The finished workouts by month, the newest first, with the import and the export
struct PastWorkoutsView: View {

    @State var showCSVExport: Bool = false
    @State var showCSVImport: Bool = false

    @Query(
        filter: #Predicate <Workout> {$0.inProgress == false},
        sort: [SortDescriptor(\Workout.date, order: .reverse)]
    ) var workouts: [Workout]

    // The workouts are sorted, so a month follows the one after it
    private var months: [(month: Date, workouts: [Workout])] {
        let calendar = Calendar.current
        var months: [(month: Date, workouts: [Workout])] = []
        for workout in workouts {
            let month = calendar.dateInterval(of: .month, for: workout.date)?.start ?? workout.date
            if months.last?.month == month {
                months[months.count - 1].workouts.append(workout)
            } else {
                months.append((month, [workout]))
            }
        }
        return months
    }

    var body: some View {
        List {
            ForEach(months, id: \.month) { month in
                Section {
                    ForEach(month.workouts) { workout in
                        NavigationLink(value: StatsRoute.pastWorkout(workout)) {
                            PastWorkoutRow(workout: workout)
                        }
                    }
                } header: {
                    Text("\(month.month.formatted(.dateTime.month(.wide).year())) · \(month.workouts.count == 1 ? "1 workout" : "\(month.workouts.count) workouts")")
                }
            }
        }
        .overlay {
            if workouts.isEmpty {
                ContentUnavailableView("No workouts yet", systemImage: "calendar", description: Text("Your finished workouts show up here."))
            }
        }
        .sheet(isPresented: $showCSVExport, content:{
            WorkoutExportView(workouts: workouts)
        })
        .sheet(isPresented: $showCSVImport, content:{
            ImportWorkoutsView()
        })
        .navigationTitle("Past workouts")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button("Export workouts", systemImage: "square.and.arrow.up") {
                        showCSVExport = true
                    }
                    .disabled(workouts.isEmpty)
                    Button("Import workouts", systemImage: "square.and.arrow.down") {
                        showCSVImport = true
                    }
                } label: {
                    Label("More", systemImage: "ellipsis")
                }
            }
        }
    }
}

/// A workout with its date, name, duration, sets and exercises
private struct PastWorkoutRow: View {

    let workout: Workout

    @Environment(UserSettings.self) private var userSettings

    var body: some View {
        let sets = workout.workoutExercises.reduce(0) { $0 + $1.getNumberOfSets() }
        let exercises = workout.workoutExercises.count
        HStack(spacing: 14) {
            VStack(spacing: 0) {
                Text(workout.date.formatted(.dateTime.weekday(.abbreviated)).uppercased())
                    .font(.caption2.weight(.semibold))
                Text(workout.date.formatted(.dateTime.day()))
                    .font(.title3.bold())
                    .fontDesign(.rounded)
            }
            .foregroundStyle(userSettings.appColor)
            .frame(width: 46, height: 46)
            .background(userSettings.appColor.opacity(0.12), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text(workout.name)
                    .font(.body.weight(.medium))
                    .lineLimit(1)
                Text("\(StatsSummary.formatDuration(minutes: workout.duration)) · \(sets == 1 ? "1 set" : "\(sets) sets") · \(exercises == 1 ? "1 exercise" : "\(exercises) exercises")")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(workout.name), \(workout.date.formatted(date: .complete, time: .omitted))")
    }
}
