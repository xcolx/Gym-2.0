//
//  WorkoutShareImageTests.swift
//  Gym 2.0Tests
//
//  Created by Colin Rüegg on 16.11.2026.
//
//  Core/Domain/WorkoutShareImage.swift and Features/Stats/PastWorkouts/WorkoutShareImageView.swift
//

import Foundation
import SwiftUI
import Testing
@testable import Gym_2_0

@MainActor
struct WorkoutShareImageTests {

    private let lines = [(title: "Date", value: "12.10.26"), (title: "Time trained", value: "1 h 15 min"), (title: "Sets", value: "4")]

    /// A workout with `count` exercises of `sets` sets each
    private func workout(in store: TestStore, name: String = "Push", exercises count: Int, sets: Int = 2) -> Workout {
        store.workout(name, duration: 75, exercises: (1...max(count, 1)).prefix(count).map { index in
            (store.exercise("Exercise \(index)"), Sets(reps: Array(repeating: 10, count: sets), weights: Array(repeating: 60, count: sets)))
        })
    }

    private func content(of workout: Workout) -> WorkoutShareImageContent {
        WorkoutShareImageContent(workout: workout, summaryLines: lines, weightUnit: .metric, distanceUnit: .metric)
    }

    @Test func showsTheNameAndTheTotalsWithoutTheDate() throws {
        let store = try TestStore()
        let content = content(of: workout(in: store, exercises: 2))
        #expect(content.name == "Push")
        #expect(content.lines.map(\.title) == ["Time trained", "Sets"])
        #expect(content.lines.map(\.value) == ["1 h 15 min", "4"])
    }

    @Test func listsTheExercisesInTheOrderOfTheWorkoutWithTheirSets() throws {
        let store = try TestStore()
        let workout = store.workout(exercises: [
            (store.exercise("Lunge"), Sets(reps: [10, 8], weights: [20, 20], unilateral: true)),
            (store.exercise("Plank", tracksReps: false, tracksWeights: false, tracksTime: true), Sets(time: [60]))
        ])
        #expect(content(of: workout).columns == [[
            .init(number: 1, name: "Lunge", lines: ["R 10x, 20.0 kg", "L 8x, 20.0 kg"]),
            .init(number: 2, name: "Plank", lines: ["1:00"])
        ]])
    }

    @Test func leavesOutTheSetsAfterTheFirstFourOfAnExerciseWithMoreThanFive() {
        #expect(WorkoutShareImageContent.setLines(["a", "b", "c", "d", "e"]) == ["a", "b", "c", "d", "e"])
        #expect(WorkoutShareImageContent.setLines(["a", "b", "c", "d", "e", "f", "g"]) == ["a", "b", "c", "d", "+ 3 more"])
    }

    @Test func hasNoColumnWithoutExercises() throws {
        let store = try TestStore()
        #expect(content(of: workout(in: store, exercises: 0)).columns.isEmpty)
    }

    @Test func addsAColumnWhenTheOnesBeforeAreFull() throws {
        let store = try TestStore()
        // An exercise with 2 sets is 68 high, with the gap of 14 seven fit in the 568 of a column
        let sizes = { (count: Int, sets: Int) in
            self.content(of: self.workout(in: store, exercises: count, sets: sets)).columns.map(\.count)
        }
        #expect(sizes(7, 2) == [7])
        #expect(sizes(8, 2) == [7, 1])
        #expect(sizes(21, 2) == [7, 7, 7])
        // With the most lines (128 high) four fit
        #expect(sizes(10, 9) == [4, 4, 2])
    }

    @Test func countsTheExercisesThatDoNotFit() throws {
        let store = try TestStore()
        #expect(content(of: workout(in: store, exercises: 21)).moreExercisesText == nil)

        let tooMany = content(of: workout(in: store, exercises: 24))
        #expect(tooMany.columns.flatMap { $0 }.map(\.number) == Array(1...21))
        #expect(tooMany.moreExercisesText == "+ 3 more exercises")

        #expect(content(of: workout(in: store, exercises: 22)).moreExercisesText == "+ 1 more exercise")
    }

    @Test func namesTheFileAfterTheWorkout() throws {
        let store = try TestStore()
        let fileName = { (name: String) in
            self.content(of: self.workout(in: store, name: name, exercises: 1)).fileName
        }
        #expect(fileName("Push day") == "Push day.png")
        #expect(fileName(" Legs / Core: \"heavy\"? ") == "Legs Core heavy.png")
        #expect(fileName(" /// ") == "Workout.png")
    }

    @Test func drawsAnImageWithARatioOfTwoToThree() async throws {
        let store = try TestStore()
        store.insertReferenceData()
        for (count, sets, scheme) in [(14, 4, ColorScheme.light), (6, 3, .dark)] {
            let workout = workout(in: store, exercises: count, sets: sets)
            let image = try #require(await WorkoutShareImageView.render(content: content(of: workout), musclesTrained: workout.musclesTrained(), colorScheme: scheme, imageService: nil))
            #expect(image.cgImage?.width == 1600)
            #expect(image.cgImage?.height == 2400)
        }
    }
}
