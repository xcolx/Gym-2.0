//
//  Workout+Helpers.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 18.08.2024.
//

import Foundation
import OSLog
import SwiftData

extension Logger {
    static let workout = Logger(subsystem: Bundle.main.bundleIdentifier ?? "Gym 2.0", category: "Workout")
}

extension Workout {
    
    static func currentWeek() -> Predicate<Workout> {
        
        let startOfWeek = Calendar.current.dateInterval(of: .weekOfYear, for: Date())!.start
        
        return #Predicate<Workout> { workout in
            workout.date > startOfWeek && workout.inProgress == false
        }
    }
    
    // The days shown on Home ("Muscles worked out the last 3 days"), today included
    static let recentDays = 3

    // Finished and started today or on the recentDays - 1 days before, regardless of the week, so that Home doesn't
    // start empty on the first day of the week
    func isRecent(now: Date = .now, calendar: Calendar = .current) -> Bool {
        guard let start = Self.recentStart(now: now, calendar: calendar) else { return false }
        return !inProgress && date >= start
    }

    // The start of the first of the recent days
    static func recentStart(now: Date = .now, calendar: Calendar = .current) -> Date? {
        calendar.date(byAdding: .day, value: -(recentDays - 1), to: calendar.startOfDay(for: now))
    }

    // The workouts isRecent is true for, fetched by the store instead of filtered from all workouts
    static func recent(since start: Date) -> Predicate<Workout> {
        #Predicate<Workout> { workout in
            workout.date >= start && workout.inProgress == false
        }
    }

    // Muscles trained in this workout as primary and as secondary muscle
    func musclesTrained() -> ([Muscle], [Muscle]){
        var ret: ([Muscle], [Muscle]) = ([], [])
        
        self.workoutExercises.forEach { workoutExercise in
            workoutExercise.exercise?.primaryMuscles.forEach { muscle in
                if !ret.0.contains(muscle) {
                    ret.0.append(muscle)
                }
            }
            workoutExercise.exercise?.secondaryMuscles.forEach { muscle in
                if !ret.1.contains(muscle) {
                    ret.1.append(muscle)
                }
            }
        }
        
        return ret
    }
    
    // Whether a value was entered in any set. Without one, save(_:bodyWeight:end:) would delete the workout.
    func hasEnteredValues(bodyWeight: Double) -> Bool {
        workoutExercises.contains { workoutExercise in
            (0..<workoutExercise.entryCount).contains { !workoutExercise.isEntryEmpty(at: $0, bodyWeight: bodyWeight) }
        }
    }

    // Ends the workout at `end` (now, or the suggested end the user picked, see suggestedEnd), removes the sets in which
    // nothing was entered and the exercises without sets. The bodyweight is in kilograms.
    func save(_ context: ModelContext, bodyWeight: Double, end: Date = .now){
        self.duration = max(0, Int((end.timeIntervalSince(self.date))/60))
        self.inProgress = false
        WorkoutLastChange.remove(clientUUID)
        
        
        var exerciseIndex = 0
            
            while exerciseIndex < self.workoutExercises.count {
                let workoutExercise = self.workoutExercises[exerciseIndex]
                
                var setIndex = 0
                
                while setIndex < workoutExercise.entryCount {
                    if workoutExercise.unilateral == false && workoutExercise.isEntryEmpty(at: setIndex, bodyWeight: bodyWeight) {
                        workoutExercise.removeEntry(at: setIndex)
                    } else  if workoutExercise.unilateral == true && setIndex % 2 == 0 && workoutExercise.isEntryEmpty(at: setIndex, bodyWeight: bodyWeight) && workoutExercise.isEntryEmpty(at: setIndex + 1, bodyWeight: bodyWeight) {
                        workoutExercise.removeEntry(at: setIndex)
                        workoutExercise.removeEntry(at: setIndex)
                    } else {
                        setIndex += 1
                    }
                }
                
                if workoutExercise.entryCount == 0 {
                    self.workoutExercises.remove(at: exerciseIndex)
                    context.deleteSynced(workoutExercise)
                    
                } else {
                    exerciseIndex += 1
                }
            }
            
            // the indexes have to be consecutive for the server
            for (index, workoutExercise) in self.workoutExercises.sorted(by: { $0.index < $1.index }).enumerated() {
                workoutExercise.index = index
            }
            
            if self.workoutExercises.isEmpty {
                context.deleteSynced(self)
            } else {
                markChanged()
            }
        }
    
    // Marks the synced workout and its synced exercises as changed, so that they are pushed on the next sync.
    // Without the exercises only the name, date, duration and whether it's in progress are pushed.
    func markChanged(includingExercises: Bool = true) {
        if syncState == .synced {
            syncState = .updated
        }
        if includingExercises {
            workoutExercises.forEach { $0.markChanged() }
        }
    }
    
    // The server takes at most 25 characters for the names of workouts and workout schemes
    static let maxNameLength = 25

    // The server takes a duration of at most a day, in minutes
    static let maxDuration = 1440
    
    // Appends the exercises after the existing ones, each with one empty set. The bodyweight is in kilograms.
    func addExercises(_ exercises: [Exercise], bodyWeight: Double) {
        if !exercises.isEmpty {
            noteChange()
        }
        var index = workoutExercises.count
        exercises.forEach { exercise in
            let workoutExercise = WorkoutExercise(workout: self, exercise: exercise, index: index)
            workoutExercise.startSets(bodyWeight: bodyWeight)
            workoutExercises.append(workoutExercise)
            index += 1
        }
    }
    
    // The bodyweight is in kilograms
    static func create(name: String, exercises: [Exercise], bodyWeight: Double) -> Workout{
        
        let workout = Workout(name: name)
        
        workout.workoutExercises = exercises.enumerated().map { index, exercise in
            let workoutExercise = WorkoutExercise(workout: workout, exercise: exercise, index: index)
            workoutExercise.startSets(bodyWeight: bodyWeight)
            return workoutExercise
        }
        
        return workout
        
    }
}

extension Array where Element == Workout {
    
    // Muscles trained as primary muscle and muscles only trained as secondary muscle.
    // A muscle trained as secondary muscle in three exercises counts as trained as primary muscle.
    func musclesTrained() -> ([Muscle], [Muscle]){
        var muscles: ([Muscle], [Muscle]) = ([], [])
        // how many exercises trained the muscle as secondary muscle
        var secondaryCounts: [Muscle: Int] = [:]
        self.forEach { workout in
            workout.workoutExercises.forEach {workoutExercise in
                workoutExercise.exercise?.primaryMuscles.forEach{ muscle in
                    if !muscles.0.contains(muscle){
                        muscles.0.append(muscle)
                        muscles.1.removeAll { $0 == muscle }
                    }
                }
                workoutExercise.exercise?.secondaryMuscles.forEach{ muscle in
                    guard !muscles.0.contains(muscle) else { return }
                    let count = secondaryCounts[muscle, default: 0] + 1
                    secondaryCounts[muscle] = count
                    if count >= 3 {
                        muscles.1.removeAll { $0 == muscle }
                        muscles.0.append(muscle)
                    } else if !muscles.1.contains(muscle) {
                        muscles.1.append(muscle)
                    }
                }
            }
        }
        return muscles
    }
}
