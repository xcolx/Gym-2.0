//
//  SuggestedWorkoutSettingsView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 15.08.2024.
//

import SwiftUI
import SwiftData

/// How long the suggested workout should take and which equipment is available. The exercises are only picked when
/// "Create workout" is tapped.
struct SuggestedWorkoutSettingsView: View {

    @Binding var navigationStackPath: [NavigationDestination]

    @State private var timeForWorkout: Double = 90
    // server ids of the selected equipment, bodyweight exercises are always possible
    @State private var selectedEquipmentIds: Set<Int> = []

    @Query(filter: Workout.currentWeek()) private var workoutsThisWeek: [Workout]
    @Query private var exercises: [Exercise]
    @Query(sort: \Equipment.name) private var equipment: [Equipment]

    @Environment(UserSettings.self) private var userSettings

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 12) {
                    Text("How long?")
                        .font(.headline)
                    Text(formatTime(timeInMinutes: timeForWorkout))
                        .font(.largeTitle.bold())
                        .fontDesign(.rounded)
                        .monospacedDigit()
                        .contentTransition(.numericText())
                        .animation(.snappy, value: timeForWorkout)
                        .frame(maxWidth: .infinity)
                    Slider(value: $timeForWorkout, in: 15...180, step: 15) {
                        Text("Time")
                    } minimumValueLabel: {
                        Text("15 min")
                    } maximumValueLabel: {
                        Text("3 h")
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    Text(WorkoutSuggestion.exerciseCount(minutes: timeForWorkout) == 1 ? "About 1 exercise" : "About \(WorkoutSuggestion.exerciseCount(minutes: timeForWorkout)) exercises")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity)
                }
                .padding()
                .cardBackground()

                VStack(alignment: .leading, spacing: 12) {
                    Text("Which equipment do you have?")
                        .font(.headline)
                    FlowLayout(spacing: 8) {
                        ForEach(equipment) { pieceOfEquipment in
                            equipmentTag(pieceOfEquipment)
                        }
                    }
                    Text("Bodyweight exercises are always included.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                .padding()
                .frame(maxWidth: .infinity, alignment: .leading)
                .cardBackground()
            }
            .padding()
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("Suggested workout")
        .navigationBarTitleDisplayMode(.inline)
        .bottomActionBar {
            Button(action: create) {
                Label("Create workout", systemImage: "sparkles")
            }
            .buttonStyle(PrimaryButtonStyle())
        }
    }

    private func equipmentTag(_ pieceOfEquipment: Equipment) -> some View {
        let isSelected = isSelected(pieceOfEquipment)
        return Button {
            if selectedEquipmentIds.contains(pieceOfEquipment.serverId) {
                selectedEquipmentIds.remove(pieceOfEquipment.serverId)
            } else {
                selectedEquipmentIds.insert(pieceOfEquipment.serverId)
            }
        } label: {
            HStack(spacing: 4) {
                if isSelected {
                    Image(systemName: "checkmark")
                        .font(.caption.weight(.bold))
                }
                Text(pieceOfEquipment.name)
            }
            .font(.subheadline.weight(.medium))
            .foregroundStyle(isSelected ? userSettings.appColorForeground : Color.primary)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(isSelected ? userSettings.appColor : Color(.tertiarySystemFill), in: Capsule())
        }
        .buttonStyle(.plain)
        // always selected, but not dimmed like a disabled button
        .allowsHitTesting(!WorkoutSuggestion.isAlwaysAvailable(pieceOfEquipment))
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    private func create() {
        let settings = WorkoutSuggestion.Settings(equipmentIds: selectedEquipmentIds, minutes: timeForWorkout)
        let list = WorkoutSuggestion.exercises(for: settings, exercises: exercises, equipment: equipment, workoutsThisWeek: workoutsThisWeek)
        navigationStackPath.append(.suggestedWorkout(settings: settings, exerciseList: list))
    }

    func formatTime(timeInMinutes: Double) -> String {
        let timeInMinutes = Int(timeInMinutes)
        let hours = timeInMinutes / 60
        let minutes = timeInMinutes % 60

        if hours == 0 {
            return "\(minutes) min"
        } else if minutes == 0 {
            return "\(hours) h"
        } else {
            return "\(hours) h \(minutes) min"
        }
    }

    func isSelected(_ pieceOfEquipment: Equipment) -> Bool {
        WorkoutSuggestion.isAlwaysAvailable(pieceOfEquipment) || selectedEquipmentIds.contains(pieceOfEquipment.serverId)
    }
}
