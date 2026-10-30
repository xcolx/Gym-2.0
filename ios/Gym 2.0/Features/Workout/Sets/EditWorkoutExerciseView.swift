//
//  EditWorkoutExerciseView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 13.09.2024.
//

import SwiftUI

struct EditWorkoutExerciseView: View {

    @State var workoutExercise: WorkoutExercise
    @Environment(UserSettings.self) var userSettings

    private var bodyWeight: Double {
        userSettings.bodyweight ?? 0
    }

    // With more than two metrics the set table needs the full width, the buttons are shown above it
    private var compact: Bool {
        workoutExercise.trackedMetrics.count > 2
    }

    var body: some View {
        if compact {
            VStack{
                HStack{
                    addButton
                    removeButton
                    Spacer()
                    unilateralToggle
                }
                .padding(.horizontal, 10)

                NumberInsertView(workoutExercise: workoutExercise)
            }
        } else {
            HStack{
                VStack{
                    addButton
                    removeButton
                    unilateralToggle

                    HighlightedBodyView(primaryMuscles: workoutExercise.exercise?.primaryMuscles ?? [], secondaryMuscles: workoutExercise.exercise?.secondaryMuscles ?? [])
                }


                NumberInsertView(workoutExercise: workoutExercise)

            }
        }
    }

    var addButton: some View {
        Button(action: {
            if workoutExercise.unilateral{
                workoutExercise.appendEntry(bodyWeight: bodyWeight)
            }
            workoutExercise.appendEntry(bodyWeight: bodyWeight)
            workoutExercise.workout?.noteChange()
        }, label: {
            Text("add set")
                .foregroundStyle(Color("MyWhite"))
                .font(.headline)
                .padding(.horizontal, 15)
                .padding(.vertical, 5)
                .background(
                    RoundedRectangle(cornerRadius: 25)
                        .tint(Color("MyBlack"))
                )
        })
    }

    var removeButton: some View {
        Button(action: {
            if workoutExercise.unilateral{
                if workoutExercise.entryCount > 2{
                    workoutExercise.removeEntry(at: workoutExercise.entryCount - 1)
                    workoutExercise.removeEntry(at: workoutExercise.entryCount - 1)
                }
            } else {
                if workoutExercise.entryCount > 1{
                    workoutExercise.removeEntry(at: workoutExercise.entryCount - 1)
                }
            }

        }, label: {
            Text("remove set")
                .foregroundStyle(Color("MyWhite"))
                .font(.headline)
                .padding(.horizontal, 15)
                .padding(.vertical, 5)
                .background(
                    RoundedRectangle(cornerRadius: 25)
                        .tint(Color("MyBlack"))
                )
        })
    }

    var unilateralToggle: some View {
        HStack{
            Text("unilateral")
            Toggle("", isOn: Binding(get: { workoutExercise.unilateral }, set: { workoutExercise.setUnilateral($0) }))
                .labelsHidden()
        }
    }

}
