//
//  ImportantStatsView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 14.08.2024.
//

import SwiftUI

struct ImportantStatsView: View {
    
    @Environment(WorkoutTotals.self) private var workoutTotals
    @Environment(UserSettings.self) var userSettings
        
    
    var body: some View {
        let summary = workoutTotals.summary ?? StatsSummary()
        VStack{
            StatRowView("Number of Workouts", "\(summary.workouts)")
            StatRowView("Total Time Trained", StatsSummary.formatDuration(minutes: summary.duration))
            StatRowView("Total Sets", "\(summary.sets)")
            StatRowView("Total Reps", "\(Int(summary.reps.total))")
            StatRowView("Total Volume", userSettings.weightUnit.formatVolume(kilograms: summary.volume))
            StatRowView("Total Distance", userSettings.distanceUnit.formatDistance(meters: summary.distance.total))
        }
        .redacted(reason: workoutTotals.summary == nil ? .placeholder : [])
        .padding(.horizontal, 10)
    }
    
}
