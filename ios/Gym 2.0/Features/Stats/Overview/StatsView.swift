//
//  StatsView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 14.08.24.
//

import SwiftUI
import SwiftData

/// The screens of the stats tab. Pushed by value, so that a destination is only created when it's shown: built eagerly
/// by NavigationLink(destination:), the toolbar of a pushed screen updated the screen below it, which created the
/// destination again, in an endless loop that froze the app.
enum StatsRoute: Hashable {
    case distribution
    case exercises
    case exercise(Exercise)
    case pastWorkouts
    case pastWorkout(Workout)
    case facts
}

/// The overview of the stats: the totals, the activity of the last year, the links to the exercises and the past
/// workouts, the most trained muscles and one of the interesting facts
struct StatsView: View {

    @Binding var tabSelection: String
    @Binding var workoutNavigationStackPath: [NavigationDestination]

    @Environment(WorkoutTotals.self) private var workoutTotals
    @Environment(UserSettings.self) private var userSettings

    /// Moved on every time the stats tab is opened, so that another fact is shown. Kept across launches.
    @AppStorage("statsFactIndex") private var factIndex = 0
    /// The day of the activity board whose minutes are shown, until something else is tapped
    @State private var selectedActivityDay: Date?

    @Query(sort: \Muscle.name) private var muscles: [Muscle]
    @Query(StatsView.lastWorkoutDescriptor) private var lastWorkouts: [Workout]

    private static var lastWorkoutDescriptor: FetchDescriptor<Workout> {
        var descriptor = FetchDescriptor<Workout>(predicate: #Predicate { $0.inProgress == false }, sortBy: [SortDescriptor(\.date, order: .reverse)])
        descriptor.fetchLimit = 1
        return descriptor
    }

    var body: some View {
        NavigationStack{
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    totals

                    ActivityBoardView(minutesByDay: workoutTotals.overview?.minutesByDay ?? [:], selectedDay: $selectedActivityDay)
                        .padding()
                        .cardBackground()

                    linksSection
                    musclesSection
                    factSection
                }
                .padding(.horizontal)
                .padding(.bottom)
                // tapping anywhere else than on a day of the activity board
                .contentShape(Rectangle())
                .onTapGesture {
                    withAnimation(.snappy(duration: 0.2)) {
                        selectedActivityDay = nil
                    }
                }
            }
            .onDisappear {
                selectedActivityDay = nil
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Statistics")
            .navigationDestination(for: StatsRoute.self) { route in
                switch route {
                case .distribution:
                    DistributionByMuscleView()
                case .exercises:
                    ExercisesStatsView()
                case .exercise(let exercise):
                    ExercisesStatsDetailView(exercise: exercise)
                case .pastWorkouts:
                    PastWorkoutsView()
                case .pastWorkout(let workout):
                    PastWorkoutDetailView(workout: workout, tabSelection: $tabSelection, workoutNavigationStackPath: $workoutNavigationStackPath)
                case .facts:
                    InterestingFactsView()
                }
            }
        }
        .onChange(of: tabSelection, initial: true) {
            if tabSelection == "Stats" {
                factIndex += 1
            }
        }
    }

    // MARK: - Totals

    private var totals: some View {
        let summary = workoutTotals.summary ?? StatsSummary()
        return LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 3), spacing: 10) {
            TotalTile(systemImage: "figure.strengthtraining.traditional", value: "\(summary.workouts)", label: "Workouts")
            TotalTile(systemImage: "clock", value: StatsSummary.formatHours(minutes: summary.duration), label: "Trained")
            TotalTile(systemImage: "square.stack.3d.up", value: "\(summary.sets)", label: "Sets")
            TotalTile(systemImage: "repeat", value: "\(Int(summary.reps.total))", label: "Reps")
            TotalTile(systemImage: "scalemass", value: userSettings.weightUnit.formatVolume(kilograms: summary.volume), label: "Volume")
            TotalTile(systemImage: "figure.run", value: userSettings.distanceUnit.formatDistance(meters: summary.distance.total), label: "Distance")
        }
        .redacted(reason: workoutTotals.summary == nil ? .placeholder : [])
    }

    // MARK: - Muscles

    private var musclesSection: some View {
        let setsByMuscleId = workoutTotals.overview?.setsByMuscleId ?? [:]
        let topMuscles = muscles
            .map { (muscle: $0, sets: setsByMuscleId[$0.serverId] ?? 0) }
            .filter { $0.sets > 0 }
            .sorted { $0.sets > $1.sets }
            .prefix(5)
        let highest = topMuscles.first?.sets ?? 1

        return VStack(alignment: .leading, spacing: 10) {
            SectionHeader(title: "Muscles", route: topMuscles.isEmpty ? nil : .distribution)

            VStack(alignment: .leading, spacing: 14) {
                if topMuscles.isEmpty {
                    Text("Your most trained muscles show up here after your first workout.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(topMuscles, id: \.muscle.persistentModelID) { item in
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text(item.muscle.name)
                                Spacer()
                                Text("\(Int(item.sets.rounded())) sets")
                                    .monospacedDigit()
                                    .foregroundStyle(.secondary)
                            }
                            .font(.subheadline)
                            Capsule()
                                .fill(Color(.systemFill))
                                .frame(height: 8)
                                .overlay(alignment: .leading) {
                                    GeometryReader { proxy in
                                        Capsule()
                                            .fill(userSettings.appColor)
                                            .frame(width: proxy.size.width * item.sets / highest)
                                    }
                                }
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
            }
            .padding()
            .frame(maxWidth: .infinity, alignment: .leading)
            .cardBackground()
        }
    }

    // MARK: - Exercises and past workouts

    private var linksSection: some View {
        let exerciseCount = workoutTotals.overview?.exerciseCount ?? 0
        return VStack(spacing: 0) {
            NavigationLink(value: StatsRoute.exercises) {
                LinkRow(systemImage: "dumbbell", title: "Exercises", subtitle: exerciseCount == 1 ? "1 exercise done" : "\(exerciseCount) exercises done")
            }
            Divider()
                .padding(.leading, 56)
            NavigationLink(value: StatsRoute.pastWorkouts) {
                LinkRow(systemImage: "calendar", title: "Past workouts", subtitle: lastWorkouts.first.map { "Last: \($0.name) · \(Self.relativeDay($0.date))" } ?? "No workouts yet")
            }
        }
        .buttonStyle(.plain)
        .cardBackground()
    }

    // "today", "yesterday" or the date
    private static func relativeDay(_ date: Date) -> String {
        let calendar = Calendar.current
        if calendar.isDateInToday(date) { return "today" }
        if calendar.isDateInYesterday(date) { return "yesterday" }
        return date.formatted(.dateTime.day().month())
    }

    // MARK: - Interesting fact

    @ViewBuilder
    private var factSection: some View {
        let facts = workoutTotals.overview?.facts ?? []
        if !facts.isEmpty {
            let fact = facts[((factIndex % facts.count) + facts.count) % facts.count]
            VStack(alignment: .leading, spacing: 10) {
                SectionHeader(title: "Interesting fact", route: nil)

                VStack(alignment: .leading, spacing: 8) {
                    HStack(alignment: .firstTextBaseline) {
                        Label(fact.title, systemImage: "lightbulb.fill")
                            .font(.headline)
                            .labelStyle(TintedIconLabelStyle(color: userSettings.appColor))
                        Spacer()
                        ShareLink(item: "Look at this cool fact the Gym 2.0 app told me about my workouts: \n \n" + fact.text) {
                            Image(systemName: "square.and.arrow.up")
                                .accessibilityLabel("Share fact")
                        }
                    }
                    Text(fact.text)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding()
                .frame(maxWidth: .infinity, alignment: .leading)
                .cardBackground()
            }
        }
    }
}

// MARK: - Parts

/// One of the totals at the top
private struct TotalTile: View {
    let systemImage: String
    let value: String
    let label: String

    @Environment(UserSettings.self) private var userSettings

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Image(systemName: systemImage)
                .font(.subheadline)
                .foregroundStyle(userSettings.appColor)
                .accessibilityHidden(true)
            Text(value)
                .font(.title3.bold())
                .fontDesign(.rounded)
                .monospacedDigit()
                // large numbers shrink instead of wrapping out of the tile
                .lineLimit(1)
                .minimumScaleFactor(0.5)
            Text(label)
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardBackground()
        .accessibilityElement(children: .combine)
    }
}

/// The title of a part of the overview, with a link to all of it
private struct SectionHeader: View {
    let title: String
    let route: StatsRoute?

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title)
                .font(.title3.bold())
            Spacer()
            if let route {
                NavigationLink(value: route) {
                    Text("See all")
                        .font(.subheadline.weight(.medium))
                }
            }
        }
        .padding(.horizontal, 4)
    }
}

/// A row that opens one of the lists of the stats
private struct LinkRow: View {
    let systemImage: String
    let title: String
    let subtitle: String

    @Environment(UserSettings.self) private var userSettings

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: systemImage)
                .font(.title3)
                .foregroundStyle(userSettings.appColor)
                .frame(width: 26)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.body.weight(.medium))
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.tertiary)
        }
        .padding()
        .contentShape(Rectangle())
    }
}

/// A label with its icon in a color and its title in the primary color
private struct TintedIconLabelStyle: LabelStyle {
    let color: Color

    func makeBody(configuration: Configuration) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            configuration.icon
                .foregroundStyle(color)
            configuration.title
        }
    }
}
