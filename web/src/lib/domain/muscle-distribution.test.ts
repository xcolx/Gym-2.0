import { describe, expect, it } from "vitest";

import { makeExercise, makeWorkoutWithExercises, muscleGroups, muscles } from "@/test/fixtures";
import { distributionRows } from "./muscle-distribution";

// Chest (1) primary, Triceps (2) secondary
const bench = makeExercise({ muscleGroupId: 1, primaryMuscleIds: [1], secondaryMuscleIds: [2] });
// Quads (4)
const squat = makeExercise({ muscleGroupId: 2, primaryMuscleIds: [4] });

const push = makeWorkoutWithExercises({}, [[bench, { reps: [10, 10, 10], weights: [60, 60, 60] }]]);
const legs = makeWorkoutWithExercises({}, [[squat, { reps: [5, 5], weights: [100, 100] }]]);
const unilateralLegs = makeWorkoutWithExercises({}, [[squat, { unilateral: true, reps: [5, 5, 5, 5], weights: [20, 20, 20, 20] }]]);

/** The value of every row by its name */
const values = (...args: Parameters<typeof distributionRows>) =>
  Object.fromEntries(distributionRows(...args).map((row) => [row.name, row.value]));

describe("distributionRows", () => {
  it("is 0 for every muscle without workouts", () => {
    expect(values([], muscles, muscleGroups, "Reps", "Muscle")).toEqual({ Chest: 0, Triceps: 0, "Front Deltoid": 0, Quads: 0 });
    expect(values([], muscles, muscleGroups, "Workouts", "Muscle Group")).toEqual({ Chest: 0, Legs: 0 });
  });

  it("counts reps of muscles, a secondary muscle a third", () => {
    const reps = values([push, legs], muscles, muscleGroups, "Reps", "Muscle");
    expect(reps.Chest).toBe(30);
    expect(reps.Triceps).toBeCloseTo(9.9);
    expect(reps["Front Deltoid"]).toBe(0);
    expect(reps.Quads).toBe(10);
  });

  it("counts a unilateral set once", () => {
    const sets = values([push, unilateralLegs], muscles, muscleGroups, "Sets", "Muscle");
    expect(sets.Chest).toBe(3);
    expect(sets.Quads).toBe(2);
  });

  it("counts workouts of the primary muscles only", () => {
    expect(values([push, legs, legs], muscles, muscleGroups, "Workouts", "Muscle")).toEqual({
      Chest: 1,
      Triceps: 0,
      "Front Deltoid": 0,
      Quads: 2,
    });
  });

  it("counts by muscle group", () => {
    expect(values([push, legs], muscles, muscleGroups, "Sets", "Muscle Group")).toEqual({ Chest: 3, Legs: 2 });
    expect(values([push, legs, legs], muscles, muscleGroups, "Workouts", "Muscle Group")).toEqual({ Chest: 1, Legs: 2 });
  });

  it("ignores workout exercises whose exercise was deleted", () => {
    const orphan = { ...push, workoutExercises: push.workoutExercises.map((we) => ({ ...we, exercise: null })) };
    expect(values([orphan], muscles, muscleGroups, "Reps", "Muscle")).toEqual({ Chest: 0, Triceps: 0, "Front Deltoid": 0, Quads: 0 });
    expect(values([orphan], muscles, muscleGroups, "Workouts", "Muscle Group")).toEqual({ Chest: 0, Legs: 0 });
  });

  it("lists the values, the most trained first, then by name", () => {
    expect(distributionRows([push, legs], muscles, muscleGroups, "Sets", "Muscle")).toEqual([
      { name: "Chest", value: 3 },
      { name: "Quads", value: 2 },
      { name: "Triceps", value: 0.99 },
      { name: "Front Deltoid", value: 0 },
    ]);
  });
});
