//
//  EditWorkoutExerciseView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 13.09.2024.
//

import SwiftUI

/// The set table of an exercise of a workout, with the buttons to add and remove a set and the unilateral switch below
struct EditWorkoutExerciseView: View {

    @State var workoutExercise: WorkoutExercise
    /// See NumberInsertView.limitsRows
    var limitsRows = true
    @Environment(UserSettings.self) var userSettings

    private var bodyWeight: Double {
        userSettings.bodyweight ?? 0
    }

    /// One set is always left, a unilateral set has an entry per side
    private var canRemoveSet: Bool {
        workoutExercise.entryCount > (workoutExercise.unilateral ? 2 : 1)
    }

    var body: some View {
        VStack(spacing: 14) {
            NumberInsertView(workoutExercise: workoutExercise, limitsRows: limitsRows)

            HStack(spacing: 8) {
                Button(action: addSet) {
                    Label("Add set", systemImage: "plus")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(userSettings.appColor)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(userSettings.appColor.opacity(0.15), in: Capsule())
                        .fixedSize()
                }
                .buttonStyle(.plain)

                // only the icon, the row is too narrow for the toggle and two labels
                Button(action: removeSet) {
                    Image(systemName: "minus")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(canRemoveSet ? Color.primary : Color.secondary)
                        .frame(width: 36, height: 36)
                        .background(Color(.tertiarySystemFill), in: Circle())
                }
                .buttonStyle(.plain)
                .disabled(!canRemoveSet)
                .accessibilityLabel("Remove last set")

                Spacer(minLength: 8)

                Toggle(isOn: Binding(get: { workoutExercise.unilateral }, set: { workoutExercise.setUnilateral($0) })) {
                    Text("Unilateral")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .fixedSize()
                .tint(userSettings.appColor)
            }
        }
    }

    private func addSet() {
        withAnimation(.snappy(duration: 0.2)) {
            if workoutExercise.unilateral {
                workoutExercise.appendEntry(bodyWeight: bodyWeight)
            }
            workoutExercise.appendEntry(bodyWeight: bodyWeight)
        }
        workoutExercise.workout?.noteChange()
    }

    private func removeSet() {
        guard canRemoveSet else { return }
        withAnimation(.snappy(duration: 0.2)) {
            if workoutExercise.unilateral {
                workoutExercise.removeEntry(at: workoutExercise.entryCount - 1)
            }
            workoutExercise.removeEntry(at: workoutExercise.entryCount - 1)
        }
    }
}
