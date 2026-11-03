//
//  HomeView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 14.08.24.
//

import SwiftUI
import SwiftData

struct HomeView: View {

    @Environment(WorkoutTotals.self) private var workoutTotals

    // Moved on every minute while Home is shown, so the recent days follow the date
    @State private var now = Date.now
    // The muscle that is shown alone on the body, until something else is tapped or Home is left
    @State private var selectedMuscle: Muscle?

    var body: some View {
        let summary = workoutTotals.summary ?? StatsSummary()
        ScrollView {
            VStack(spacing: 0) {

                ProfileBannerView()

                HStack(spacing: 0) {
                    TotalView(value: "\(summary.workouts)", label: "Workouts")
                    Divider()
                    TotalView(value: formatTimeWorkedOut(minutes: summary.duration), label: "Trained")
                    Divider()
                    TotalView(value: "\(summary.sets)", label: "Sets")
                }
                .padding(.vertical, 14)
                .homeCard()
                .redacted(reason: workoutTotals.summary == nil ? .placeholder : [])
                .padding(.horizontal)
                .padding(.top, -36)

                if let start = Workout.recentStart(now: now) {
                    RecentMusclesView(since: start, selectedMuscle: $selectedMuscle)
                        .padding()
                }
            }
            .contentShape(Rectangle())
            .onTapGesture {
                withAnimation(.easeInOut(duration: 0.2)) {
                    selectedMuscle = nil
                }
            }
        }
        .background(Color(.systemGroupedBackground))
        .ignoresSafeArea(.keyboard)
        .onDisappear {
            selectedMuscle = nil
        }
        .task {
            while !Task.isCancelled {
                now = .now
                try? await Task.sleep(for: .seconds(60))
            }
        }
    }


    func formatTimeWorkedOut(minutes totalTime: Int) -> String{
        if totalTime < 60{
            return "\(totalTime) min"
        } else if totalTime < 598{ //598 and 599 is rounded up to 10.0 which is ugly
            let timeInHours: Double = Double(totalTime)/60
            let timeInHoursString: String = String(format: "%.1f", timeInHours)
            return timeInHoursString + " h"
        } else {
            let timeInHours: Double = Double(totalTime)/60
            let timeInHoursString: String = String(format: "%.0f", timeInHours)
            return timeInHoursString + " h"
        }
    }
}

// One of the totals in the card below the header
private struct TotalView: View {

    let value: String
    let label: String

    var body: some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.title2.bold())
                .fontDesign(.rounded)
                .monospacedDigit()
                // large numbers shrink instead of wrapping out of the card
                .lineLimit(1)
                .minimumScaleFactor(0.5)
            Text(label)
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 6)
    }
}

// The muscles of the recent workouts. Only those are fetched, with the start of the recent days in the predicate, so
// the query is created again when the day changes.
private struct RecentMusclesView: View {

    @Query var recentWorkouts: [Workout]
    @Query(sort: \Muscle.name) var muscles: [Muscle]

    @Binding var selectedMuscle: Muscle?

    @Environment(UserSettings.self) var userSettings

    init(since start: Date, selectedMuscle: Binding<Muscle?>) {
        _recentWorkouts = Query(filter: Workout.recent(since: start))
        _selectedMuscle = selectedMuscle
    }

    var body: some View {
        let trainedMuscles = recentWorkouts.musclesTrained()
        let percentage = progressBarPercentage(trainedMuscles)
        // The muscles not trained at all first, then those only trained slightly as secondary muscle, which are
        // orange on the body as well
        let slightlyTrainedMuscles = muscles.filter { trainedMuscles.1.contains($0) }
        let notTrainedMuscles = muscles.filter { !trainedMuscles.0.contains($0) && !trainedMuscles.1.contains($0) }
            + slightlyTrainedMuscles

        VStack(alignment: .leading, spacing: 12) {
            Text("Muscles · last \(Workout.recentDays) days")
                .font(.headline)

            MuscleCoverageGaugeView(percentage: percentage) {
                HighlightedBodyView(
                    primaryMuscles: trainedMuscles.0,
                    secondaryMuscles: trainedMuscles.1,
                    focusedMuscle: selectedMuscle.map { ($0, slightlyTrainedMuscles.contains($0) ? .orange : userSettings.appColor) }
                )
            }
            .frame(maxWidth: 340)
            .frame(maxWidth: .infinity)

            if !muscles.isEmpty {
                if notTrainedMuscles.isEmpty {
                    Label("Every muscle trained", systemImage: "checkmark.seal.fill")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(userSettings.appColor)
                } else {
                    Text("Not trained yet")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    FlowLayout(spacing: 6) {
                        ForEach(notTrainedMuscles) { muscle in
                            let isSelected = muscle == selectedMuscle
                            let isSlightlyTrained = slightlyTrainedMuscles.contains(muscle)
                            Button {
                                withAnimation(.easeInOut(duration: 0.2)) {
                                    selectedMuscle = isSelected ? nil : muscle
                                }
                            } label: {
                                HStack(spacing: 5) {
                                    if isSlightlyTrained {
                                        Circle()
                                            .fill(isSelected ? userSettings.appColorForeground : .orange)
                                            .frame(width: 7, height: 7)
                                    }
                                    Text(muscle.name)
                                }
                                    .font(.subheadline.weight(isSelected ? .semibold : .regular))
                                    .foregroundStyle(isSelected ? userSettings.appColorForeground : .primary)
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 5)
                                    .background(isSelected ? userSettings.appColor : userSettings.appColor.opacity(0.15), in: Capsule())
                            }
                            .buttonStyle(.plain)
                            .accessibilityValue(isSlightlyTrained ? "Trained slightly" : "")
                            .accessibilityAddTraits(isSelected ? .isSelected : [])
                        }
                    }
                    // explains the dot of the selected muscle
                    if let selectedMuscle, slightlyTrainedMuscles.contains(selectedMuscle) {
                        HStack(spacing: 5) {
                            Circle()
                                .fill(.orange)
                                .frame(width: 7, height: 7)
                            Text("Trained slightly")
                        }
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .transition(.opacity)
                        .accessibilityHidden(true)
                    }
                }
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .homeCard()
        // a muscle trained in the meantime is no longer in the list
        .onChange(of: notTrainedMuscles) {
            if let selectedMuscle, !notTrainedMuscles.contains(selectedMuscle) {
                self.selectedMuscle = nil
            }
        }
    }

    func progressBarPercentage(_ trainedMuscles: ([Muscle], [Muscle])) -> Int{
        // no muscles before the first sync
        guard !muscles.isEmpty else { return 0 }
        let numberOfPossibleMuscles: Double = Double(muscles.count)
        let primaryMusclesTrained: Double = Double(trainedMuscles.0.count)
        let secondaryMusclesTrained: Double = Double(trainedMuscles.1.count)

        return Int(((primaryMusclesTrained + 0.33 * secondaryMusclesTrained) / numberOfPossibleMuscles)*100)
    }
}

private extension View {
    // The cards on the grouped background of Home
    func homeCard() -> some View {
        background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .shadow(color: .black.opacity(0.06), radius: 10, y: 4)
    }
}
