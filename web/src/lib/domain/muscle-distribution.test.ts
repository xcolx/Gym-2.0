import { describe, expect, it } from "vitest";

import { makeExercise, makeWorkoutWithExercises, muscleGroups, muscles } from "@/test/fixtures";
import { distributionPercentages } from "./muscle-distribution";

// Chest (1) primary, Triceps (2) secondary
const bench = makeExercise({ muscleGroupId: 1, primaryMuscleIds: [1], secondaryMuscleIds: [2] });
// Quads (4)
const squat = makeExercise({ muscleGroupId: 2, primaryMuscleIds: [4] });

const push = makeWorkoutWithExercises({}, [[bench, { reps: [10, 10, 10], weights: [60, 60, 60] }]]);
const legs = makeWorkoutWithExercises({}, [[squat, { reps: [5, 5], weights: [100, 100] }]]);
const unilateralLegs = makeWorkoutWithExercises({}, [[squat, { unilateral: true, reps: [5, 5, 5, 5], weights: [20, 20, 20, 20] }]]);

describe("distributionPercentages", () => {
  it("is 0 for every muscle without workouts", () => {
    expect(distributionPercentages([], muscles, muscleGroups, "Reps", "Muscle")).toEqual([0, 0, 0, 0]);
    expect(distributionPercentages([], muscles, muscleGroups, "Workouts", "Muscle Group")).toEqual([0, 0]);
  });

  it("counts reps of muscles, a secondary muscle a third, relative to the highest", () => {
    // chest 30, triceps 0.33 * 30, quads 10
    const [chest, triceps, deltoid, quads] = distributionPercentages([push, legs], muscles, muscleGroups, "Reps", "Muscle");
    expect(chest).toBe(100);
    expect(triceps).toBeCloseTo(33);
    expect(deltoid).toBe(0);
    expect(quads).toBeCloseTo(100 / 3);
  });

  it("counts a unilateral set once", () => {
    const [chest, , , quads] = distributionPercentages([push, unilateralLegs], muscles, muscleGroups, "Sets", "Muscle");
    expect(chest).toBe(100);
    expect(quads).toBeCloseTo(200 / 3);
  });

  it("counts workouts of the primary muscles only", () => {
    expect(distributionPercentages([push, legs, legs], muscles, muscleGroups, "Workouts", "Muscle")).toEqual([50, 0, 0, 100]);
  });

  it("counts by muscle group", () => {
    const [chest, legGroup] = distributionPercentages([push, legs], muscles, muscleGroups, "Sets", "Muscle Group");
    expect(chest).toBe(100);
    expect(legGroup).toBeCloseTo(200 / 3);
    expect(distributionPercentages([push, legs, legs], muscles, muscleGroups, "Workouts", "Muscle Group")).toEqual([50, 100]);
  });

  it("ignores workout exercises whose exercise was deleted", () => {
    const orphan = { ...push, workoutExercises: push.workoutExercises.map((we) => ({ ...we, exercise: null })) };
    expect(distributionPercentages([orphan], muscles, muscleGroups, "Reps", "Muscle")).toEqual([0, 0, 0, 0]);
    expect(distributionPercentages([orphan], muscles, muscleGroups, "Workouts", "Muscle Group")).toEqual([0, 0]);
  });
});
