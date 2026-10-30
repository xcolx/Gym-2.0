//
//  VersionedSchemaV1.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 15.02.2025.
//

import Foundation
import SwiftData

enum VersionedSchemaV1: VersionedSchema {
    
    static var models: [any PersistentModel.Type] {
        [Exercise.self, Workout.self, WorkoutExercise.self, WorkoutScheme.self, Settings.self, Profile.self]
    }
    
    static var versionIdentifier: Schema.Version = .init(1, 0, 0)
}


extension VersionedSchemaV1 {
    
    @Model
    final class Exercise: Hashable{

        var id: UUID = UUID()
        
        @Attribute(.unique)
        var name: String
        
        var exerciseDescription: String
        var image: Data?
        var muscleGroup: MuscleGroups
        var primaryMuscles: [Muscles]
        var secondaryMuscles: [Muscles]
        var equipment: Equipment
        var verified: Bool
        
        init(name: String = "", exerciseDescription: String = "", muscleGroup: MuscleGroups = .interdisciplinary, primaryMuscles: [Muscles] = [], secondaryMuscles: [Muscles] = [], equipment: Equipment = .body, verified: Bool = false) {
            self.id = UUID()
            self.name = name
            self.exerciseDescription = exerciseDescription
            self.muscleGroup = muscleGroup
            self.primaryMuscles = primaryMuscles
            self.secondaryMuscles = secondaryMuscles
            self.equipment = equipment
            self.verified = verified
        }
    }
    
    @Model
    final class WorkoutExercise {
        var id: UUID
        var exercise: Exercise
        var unilateral: Bool
        var reps: [Int]
        var weight: [Double]
        var workout: Workout
        //to sort the workoutExercises inside a workout, SwiftData gives them in a random order
        var index: Int
        
        init(exercise: Exercise, unilateral: Bool = false, reps: [Int], weight: [Double], workout: Workout, index: Int) {
            self.id = UUID()
            self.exercise = exercise
            self.unilateral = unilateral
            self.reps = reps
            self.weight = weight
            self.workout = workout
            self.index = index
        }
    }
    
    @Model
    final class Profile {
        var name: String
        var profilePicture: Data?
        var joinDate: Date
        
        init(name: String = "User 1", profilePicture: Data? = nil, joinDate: Date = Date()) {
            self.name = name
            self.profilePicture = profilePicture
            self.joinDate = joinDate
        }
    }
    
    @Model
    final class ExerciseWithIndex {
        var id: UUID = UUID()
        
        var exercise: Exercise
        var index: Int
        
        init(exercise: Exercise, index: Int) {
            self.exercise = exercise
            self.index = index
        }
    }
    
    @Model
    final class WorkoutScheme {
        var id: UUID = UUID()
        
        @Attribute(.unique)
        var name: String
        
        @Relationship(deleteRule: .cascade)
        var exercises: [ExerciseWithIndex]
        var creationDate: Date
        
        init(name: String = "", exercises: [ExerciseWithIndex] = []) {
            self.id = UUID()
            self.name = name
            self.exercises = exercises
            self.creationDate = Date()
        }
    }
    
    @Model
    final class Workout {
        var id: UUID
        var name: String
        var date: Date
        var time: Int
        @Relationship(deleteRule: .cascade)
        var workoutExercises: [WorkoutExercise]
        var inProgress: Bool
        
        init(name: String = "", date: Date = Date.now, time: Int = 0, workoutExercises: [WorkoutExercise] = [], inProgress: Bool = true) {
            self.id = UUID()
            self.name = name
            self.date = date
            self.time = time
            self.inProgress = inProgress
            self.workoutExercises = workoutExercises
        }
        
    }
    
    @Model
    final class Settings {
        var bodyWeight: Double
        
        init(bodyWeight: Double = 0.0) {
            self.bodyWeight = bodyWeight
        }
    }
}


// Enums stored by the V1 models, part of the schema so that old stores can still be read
extension VersionedSchemaV1 {

    enum MuscleGroups: String, Codable, CaseIterable, Identifiable {
        case interdisciplinary = "Interdisciplinary"
        case arms = "Arms"
        case back = "Back"
        case core = "Core"
        case chest = "Chest"
        case legs = "Legs"
        case shoulders = "Shoulders"
        case cardio = "Cardio"

        var id: String { rawValue }
    }

    enum Muscles: String, Codable, CaseIterable, Identifiable {
        case abductors = "Abductors"
        case abs = "Abs"
        case adductors = "Adductors"
        case biceps = "Biceps"
        case calves = "Calves"
        case chest = "Chest"
        case forearms = "Forearms"
        case frontDeltoid = "Front Deltoid"
        case glutes = "Glutes"
        case hamstrings = "Hamstrings"
        case lateralDeltoid = "Lateral Deltoid"
        case lats = "Lats"
        case lowerBack = "Lower Back"
        case obliques = "Obliques"
        case quads = "Quads"
        case rearDeltoid = "Rear Deltoid"
        case trapezius = "Trapezius"
        case triceps = "Triceps"

        var id: String { rawValue }
    }

    enum Equipment: String, Codable, CaseIterable, Identifiable {
        case body = "Body"
        case gymMachine = "Gym Machine"
        case barbell = "Barbell"
        case dumbbell = "Dumbbell"
        case resistanceBand = "Resistance Band"
        case pullUpBar = "Pull Up Bar"
        case cable = "Cable"

        var id: String { rawValue }
    }
}
