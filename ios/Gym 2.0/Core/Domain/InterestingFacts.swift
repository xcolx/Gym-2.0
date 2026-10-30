//
//  InterestingFacts.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 14.10.2026.
//

import Foundation

struct InterestingFact: Identifiable {
    let title: String
    let text: String

    var id: String { title }
}

/// Builds the interesting facts from the finished workouts.
///
/// Every value that is divided by comes either from a constant or is checked before, so no fact divides by 0.
/// Facts that need data the user didn't track yet are left out or encourage the user to track it.
enum InterestingFactsCalculator {

    // Reference values the facts compare with
    static let tikTokSeconds = 42.7
    static let elephantKilograms = 6000.0
    static let blueWhaleKilograms = 150_000.0
    static let marathonMeters = 42_195.0
    static let titanicMinutes = 194 // 3 h 14 min
    static let recommendedMinutesPerWeek = 150.0 // WHO, moderate activity

    static let legsMuscleGroupName = "Legs"

    /// - Parameters:
    ///   - workouts: the finished workouts
    ///   - equipment: all equipment, to find the bodyweight exercises (body and pull up bar)
    ///   - muscleGroups: all muscle groups, to find the leg exercises
    ///   - memberSince: when the user created the account, nil if unknown
    static func facts(of workouts: [Workout], equipment: [Equipment], muscleGroups: [MuscleGroup], memberSince: Date?, weightUnit: UnitSystem, distanceUnit: UnitSystem, now: Date = .now, calendar: Calendar = .current) -> [InterestingFact] {
        let summary = StatsCalculator.summary(of: workouts)
        let workoutExercises = workouts.flatMap(\.workoutExercises)

        let bodyEquipmentIds = Set(equipment.filter { Exercise.bodyweightEquipmentNames.contains($0.name) }.map(\.serverId))
        let legsMuscleGroupIds = Set(muscleGroups.filter { $0.name == legsMuscleGroupName }.map(\.serverId))
        let bodyExercises = workoutExercises.filter { bodyEquipmentIds.contains($0.exercise?.equipmentId ?? -1) }
        let legExercises = workoutExercises.filter { legsMuscleGroupIds.contains($0.exercise?.muscleGroupId ?? -1) }

        var facts: [InterestingFact] = []

        // MARK: Let's watch Tik Tok
        let tikToks = Double(summary.duration) * 60 / tikTokSeconds
        facts.append(InterestingFact(
            title: "Let's watch Tik Tok",
            text: "You have worked out a total time of \(StatsSummary.formatDuration(minutes: summary.duration)). The average TikTok video is 42.7 seconds long. That means if you had decided not to work out every single time, you could have watched about \(formatCount(tikToks)) TikTok videos. But would these videos have made you stronger?"
        ))

        // MARK: Stay in Bed
        facts.append(InterestingFact(
            title: "Stay in Bed",
            text: "Every day you can decide to get up and do something productive like a workout or just stay in bed. Till now you have decided a total of \(workouts.count) \(workouts.count == 1 ? "time" : "times") that you want to do a workout. Keep up the good work!"
        ))

        // MARK: Move your body
        let bodyReps = bodyExercises.reduce(0) { $0 + $1.totalReps }
        let bodyVolume = bodyExercises.reduce(0) { $0 + $1.volume }
        if bodyReps > 0 {
            var text = "No machine, no barbell, just you: with bodyweight exercises you have moved your own body \(formatCount(Double(bodyReps), "time", "times"))."
            if bodyVolume > 0 {
                text += " That adds up to \(weightUnit.formatVolume(kilograms: bodyVolume)) of you."
            }
            text += " Your body is the only equipment you always have with you!"
            facts.append(InterestingFact(title: "Move your body", text: text))
        } else {
            facts.append(InterestingFact(
                title: "Move your body",
                text: "You haven't moved your own bodyweight yet. Push ups, squats or pull ups need little to no equipment, so you can do them almost everywhere. Give them a try!"
            ))
        }

        // MARK: Strong Legs
        let legVolume = legExercises.reduce(0) { $0 + $1.volume }
        if legVolume > 0 {
            let elephants = legVolume / elephantKilograms
            facts.append(InterestingFact(
                title: "Strong Legs",
                text: "With your legs you have pressed a total of \(weightUnit.formatVolume(kilograms: legVolume)). An elephant weighs about 6 tons on average, so you have pressed about \(formatCount(elephants, "elephant", "elephants")). Never skip leg day!"
            ))
        } else {
            facts.append(InterestingFact(
                title: "Strong Legs",
                text: "An elephant weighs about 6 tons. You haven't pressed a single one with your legs yet, because there is no weighted leg exercise in your workouts. Time for leg day!"
            ))
        }

        // MARK: Heavy Lifter
        if summary.volume > 0 {
            let share = summary.volume / blueWhaleKilograms
            let comparison = share < 1
                ? "That is \(formatCount(share * 100))% of a blue whale, the heaviest animal on earth, which weighs up to 150 tons."
                : "A blue whale, the heaviest animal on earth, weighs up to 150 tons. You have lifted about \(formatCount(share)) of them!"
            facts.append(InterestingFact(
                title: "Heavy Lifter",
                text: "In all your workouts together you have lifted \(weightUnit.formatVolume(kilograms: summary.volume)). " + comparison
            ))
        }

        // MARK: Marathon
        if summary.distance.total > 0 {
            let marathons = summary.distance.total / marathonMeters
            let comparison = marathons < 1
                ? "That is \(formatCount(marathons * 100))% of a marathon (42.195 km)."
                : "That is about \(formatCount(marathons, "marathon", "marathons")) (42.195 km each)."
            facts.append(InterestingFact(
                title: "Marathon",
                text: "You have covered a distance of \(distanceUnit.formatDistance(meters: summary.distance.total)) in your workouts. " + comparison
            ))
        }

        // MARK: Movie Night
        if let longest = workouts.map(\.duration).max(), longest > 0 {
            let titanics = Double(longest) / Double(titanicMinutes)
            let comparison = longest <= titanicMinutes
                ? "In that time you could have watched \(formatCount(titanics * 100))% of Titanic (3 h 14 min), one of the longest blockbusters."
                : "That is even longer than Titanic (3 h 14 min), one of the longest blockbusters. Now that's dedication!"
            facts.append(InterestingFact(
                title: "Movie Night",
                text: "Your longest workout lasted \(StatsSummary.formatDuration(minutes: longest)). " + comparison
            ))
        }

        // MARK: Favorite Day
        if !workouts.isEmpty {
            var workoutsPerWeekday = [Int](repeating: 0, count: 7)
            for workout in workouts {
                // weekday is 1 (Sunday) to 7 (Saturday)
                workoutsPerWeekday[calendar.component(.weekday, from: workout.date) - 1] += 1
            }
            // first day of the week of the user first, so a tie picks the earlier day
            let weekdays = (0..<7).map { ($0 + calendar.firstWeekday - 1) % 7 }
            let count = workoutsPerWeekday.max() ?? 0
            let favorite = weekdays.first { workoutsPerWeekday[$0] == count } ?? 0
            let percent = Double(count) / Double(workouts.count) * 100
            facts.append(InterestingFact(
                title: "Favorite Day",
                text: "\(calendar.weekdaySymbols[favorite]) seems to be your favorite day to work out: \(count) of your \(workouts.count) \(workouts.count == 1 ? "workout" : "workouts") (\(formatCount(percent))%) took place on a \(calendar.weekdaySymbols[favorite])."
            ))
        }

        // MARK: Early Bird / Night Owl
        let earlyWorkouts = workouts.filter { calendar.component(.hour, from: $0.date) < 8 }.count
        let lateWorkouts = workouts.filter { calendar.component(.hour, from: $0.date) >= 21 }.count
        if earlyWorkouts > 0 && earlyWorkouts >= lateWorkouts {
            facts.append(InterestingFact(
                title: "Early Bird",
                text: "\(earlyWorkouts) of your workouts started before 8 am, while most people were still asleep. The early bird catches the gains!"
            ))
        } else if lateWorkouts > 0 {
            facts.append(InterestingFact(
                title: "Night Owl",
                text: "\(lateWorkouts) of your workouts started at 9 pm or later, when others were already on the couch. Who needs sleep anyway?"
            ))
        }

        // MARK: Weekly Average
        // only after a full week, otherwise a single workout would give a huge average
        let firstDate = ([memberSince] + workouts.map(\.date)).compactMap { $0 }.min()
        if let firstDate, let days = calendar.dateComponents([.day], from: firstDate, to: now).day, days >= 7 {
            let minutesPerWeek = Double(summary.duration) / (Double(days) / 7)
            let average = "Since you started tracking with Gym 2.0 you have trained \(StatsSummary.formatDuration(minutes: Int(minutesPerWeek.rounded()))) per week on average. The WHO recommends at least 150 minutes of physical activity per week."
            if minutesPerWeek >= recommendedMinutesPerWeek {
                facts.append(InterestingFact(title: "Above the Recommendation", text: average + " You beat that with your workouts alone. Keep up the good work!"))
            } else {
                facts.append(InterestingFact(title: "Room to Grow", text: average + " Every walk or bike ride counts too, so keep moving and stand out from the crowd!"))
            }
        }

        return facts
    }

    /// One decimal below 10 (without a trailing 0), rounded with grouping separators above, e.g. "0.4", "2", "1,234"
    static func formatCount(_ value: Double) -> String {
        guard value.isFinite, value < 1e15 else { return "0" }
        if value < 10 {
            return UnitSystem.number(value, maxDecimals: 1)
        }
        return Int(value.rounded()).formatted()
    }

    /// e.g. "1 elephant" or "2.5 elephants", decided by the rounded number that is shown
    static func formatCount(_ value: Double, _ singular: String, _ plural: String) -> String {
        let count = formatCount(value)
        return count + " " + (count == "1" ? singular : plural)
    }
}
