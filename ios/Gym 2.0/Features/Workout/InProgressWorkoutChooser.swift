//
//  InProgressWorkoutChooser.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 13.10.2026.
//

import SwiftUI
import SwiftData

extension View {
    /// Lets the user pick one of the workouts in progress, with "Open it" if there is only one.
    /// The others stay in progress, they can be finished or cancelled once they are opened.
    func inProgressWorkoutChooser(isPresented: Binding<Bool>, title: String, message: String, onOpen: @escaping (Workout) -> Void) -> some View {
        modifier(InProgressWorkoutChooser(isPresented: isPresented, title: title, message: message, onOpen: onOpen))
    }
}

private struct InProgressWorkoutChooser: ViewModifier {

    @Binding var isPresented: Bool
    let title: String
    let message: String
    let onOpen: (Workout) -> Void

    @Query(
        filter: #Predicate<Workout> { $0.inProgress == true },
        sort: [SortDescriptor(\Workout.date, order: .reverse)]
    ) private var workouts: [Workout]

    func body(content: Content) -> some View {
        content
            .alert(title, isPresented: $isPresented) {
                if workouts.count == 1, let workout = workouts.first {
                    Button("Open it") { onOpen(workout) }
                } else {
                    ForEach(workouts) { workout in
                        Button("\(workout.name), \(formatDate(date: workout.date)) \(timeFromDate(date: workout.date))") { onOpen(workout) }
                    }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text(message)
            }
    }
}
