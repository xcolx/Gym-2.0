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
    
    var body: some View {
        let summary = workoutTotals.summary ?? StatsSummary()
        VStack {
            
            ProfileBannerView()
            
            HStack{
                
                Spacer()
                
                VStack{
                    Text("\(summary.workouts)")
                        .font(.largeTitle)
                        // large numbers shrink instead of wrapping out of the card
                        .lineLimit(1)
                        .minimumScaleFactor(0.5)
                        .foregroundStyle(Color("MyWhite"))
                    Text("Workouts")
                        .font(.headline)
                        .foregroundStyle(Color("MyWhite"))
                }
                .padding(10)
                .padding(.horizontal, 10)
                .background(
                    RoundedRectangle(cornerRadius: 15)
                        .fill(Color("MyBlack"))
                        .frame(height: 100)
                )
                
                Spacer()
                
                VStack{
                    Text(formatTimeWorkedOut(minutes: summary.duration))
                        .font(.largeTitle)
                        // large numbers shrink instead of wrapping out of the card
                        .lineLimit(1)
                        .minimumScaleFactor(0.5)
                        .foregroundStyle(Color("MyWhite"))
                    Text("trained")
                        .font(.headline)
                        .foregroundStyle(Color("MyWhite"))
                }
                .padding(10)
                .padding(.horizontal, 10)
                .background(
                    RoundedRectangle(cornerRadius: 15)
                        .fill(Color("MyBlack"))
                        .frame(height: 100)
                )
                
                Spacer()
                
                VStack{
                    Text("\(summary.sets)")
                        .font(.largeTitle)
                        // large numbers shrink instead of wrapping out of the card
                        .lineLimit(1)
                        .minimumScaleFactor(0.5)
                        .foregroundStyle(Color("MyWhite"))
                    Text("Sets")
                        .font(.headline)
                        .foregroundStyle(Color("MyWhite"))
                }
                .padding(10)
                .padding(.horizontal, 10)
                .background(
                    RoundedRectangle(cornerRadius: 15)
                        .fill(Color("MyBlack"))
                        .frame(height: 100)
                )
                
                Spacer()
            }
            .redacted(reason: workoutTotals.summary == nil ? .placeholder : [])
            .padding(.vertical, 20)
            
            Spacer()
            
            if let start = Workout.recentStart(now: now) {
                RecentMusclesView(since: start)
            }
            Spacer()
        }
        .ignoresSafeArea(.keyboard)
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

// The muscles of the recent workouts. Only those are fetched, with the start of the recent days in the predicate, so
// the query is created again when the day changes.
private struct RecentMusclesView: View {

    @Query var recentWorkouts: [Workout]
    @Query(sort: \Muscle.name) var muscles: [Muscle]

    init(since start: Date) {
        _recentWorkouts = Query(filter: Workout.recent(since: start))
    }

    var body: some View {
        let trainedMuscles = recentWorkouts.musclesTrained()
        let percentage = progressBarPercentage(trainedMuscles)
        HStack(alignment: .top){
            VStack (alignment: .leading){
                Text("Muscles worked out the last \(Workout.recentDays) days:")
                    .padding(.leading, 10)
                HighlightedBodyView(primaryMuscles: trainedMuscles.0, secondaryMuscles: trainedMuscles.1)
            }
            if percentage < 100 {
                ListOfNotTrainedMusclesView(listOfNotTrainedMuscles: muscles.filter { !trainedMuscles.0.contains($0) })
            }
        }
        ProgressBarView(percentage: percentage)
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
