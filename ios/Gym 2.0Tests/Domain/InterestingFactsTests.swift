//
//  InterestingFactsTests.swift
//  Gym 2.0Tests
//
//  Created by Colin Rüegg on 21.10.2026.
//
//  Mirrors web/src/lib/domain/interesting-facts.test.ts
//

import Foundation
import Testing
@testable import Gym_2_0

@MainActor
struct InterestingFactsTests {

    let store: TestStore
    let facts: [InterestingFact]

    init() throws {
        store = try TestStore()
        store.insertReferenceData()
        // Legs with a barbell, chest with the body
        let squat = store.exercise("Squat", muscleGroupId: 2, equipmentId: 1)
        let pushUp = store.exercise("Push Up", muscleGroupId: 1, equipmentId: 2)
        let workouts = [
            // Monday 6:30
            store.workout(date: date(2026, 10, 5, 6, 30), duration: 200, exercises: [
                (squat, Sets(reps: [10, 10], weights: [100, 100])),
                (pushUp, Sets(reps: [20], weights: [0])),
            ]),
            // Monday 18:00
            store.workout(date: date(2026, 10, 12, 18, 0), duration: 40, exercises: [
                (pushUp, Sets(reps: [15], weights: [0])),
            ]),
        ]
        facts = InterestingFactsCalculator.facts(
            of: workouts,
            equipment: store.equipment,
            muscleGroups: store.muscleGroups,
            memberSince: date(2026, 9, 1),
            weightUnit: .metric,
            distanceUnit: .metric,
            now: date(2026, 10, 15),
            calendar: testCalendar()
        )
    }

    func fact(_ title: String) -> String? {
        facts.first { $0.title == title }?.text
    }

    @Test func buildsTheFactsTheDataAllows() {
        #expect(facts.map(\.title) == [
            "Let's watch Tik Tok",
            "Stay in Bed",
            "Move your body",
            "Strong Legs",
            "Heavy Lifter",
            "Movie Night",
            "Favorite Day",
            "Early Bird",
            "Room to Grow",
        ])
    }

    @Test func comparesWithTheReferenceValues() {
        #expect(fact("Let's watch Tik Tok")?.contains("4 h 0 min") == true)
        #expect(fact("Let's watch Tik Tok")?.contains("about 337 TikTok videos") == true)
        #expect(fact("Stay in Bed")?.contains("a total of 2 times") == true)
        #expect(fact("Move your body")?.contains("35 times") == true)
        #expect(fact("Strong Legs")?.contains("2.0k kg") == true)
        #expect(fact("Strong Legs")?.contains("0.3 elephants") == true)
        #expect(fact("Heavy Lifter")?.contains("1.3% of a blue whale") == true)
        #expect(fact("Movie Night")?.contains("even longer than Titanic") == true)
        #expect(fact("Favorite Day")?.contains("Monday seems to be your favorite day") == true)
        #expect(fact("Favorite Day")?.contains("2 of your 2 workouts (100%)") == true)
        #expect(fact("Room to Grow")?.contains("38 min per week") == true)
    }

    @Test func leavesOutTheFactsWithoutDataAndEncouragesToTrackIt() {
        #expect(fact("Marathon") == nil)
        let empty = InterestingFactsCalculator.facts(
            of: [],
            equipment: store.equipment,
            muscleGroups: store.muscleGroups,
            memberSince: nil,
            weightUnit: .metric,
            distanceUnit: .metric,
            calendar: testCalendar()
        )
        #expect(empty.map(\.title) == ["Let's watch Tik Tok", "Stay in Bed", "Move your body", "Strong Legs"])
        #expect(empty[1].text.contains("a total of 0 times"))
        #expect(empty[2].text.contains("You haven't moved your own bodyweight yet"))
        #expect(empty[3].text.contains("Time for leg day!"))
    }

    @Test func comparesTheDistanceWithAMarathon() {
        let run = store.exercise("Run", tracksReps: false, tracksWeights: false, tracksDistance: true)
        let workout = store.workout(date: date(2026, 10, 14, 22, 0), duration: 30, exercises: [(run, Sets(distance: [50_000]))])
        let facts = InterestingFactsCalculator.facts(of: [workout], equipment: [], muscleGroups: [], memberSince: nil, weightUnit: .metric, distanceUnit: .metric, now: date(2026, 10, 15), calendar: testCalendar())
        let marathon = facts.first { $0.title == "Marathon" }?.text
        #expect(marathon?.contains("50 km") == true)
        #expect(marathon?.contains("about 1.2 marathons") == true)
        #expect(facts.contains { $0.title == "Night Owl" })
        // Only after a full week
        #expect(!facts.contains { $0.title == "Room to Grow" || $0.title == "Above the Recommendation" })
    }

    @Test func formatsCounts() {
        #expect(InterestingFactsCalculator.formatCount(0.44) == "0.4")
        #expect(InterestingFactsCalculator.formatCount(2) == "2")
        #expect(InterestingFactsCalculator.formatCount(1234.4) == 1234.formatted())
        #expect(InterestingFactsCalculator.formatCount(.infinity) == "0")
        #expect(InterestingFactsCalculator.formatCount(.nan) == "0")
        #expect(InterestingFactsCalculator.formatCount(1, "elephant", "elephants") == "1 elephant")
        #expect(InterestingFactsCalculator.formatCount(2.5, "elephant", "elephants") == "2.5 elephants")
        // decided by the shown number
        #expect(InterestingFactsCalculator.formatCount(1.04, "elephant", "elephants") == "1 elephant")
    }
}
