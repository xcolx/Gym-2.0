import { describe, expect, it } from "vitest";

import { makeWorkoutExercise } from "@/test/fixtures";

import { canRemoveSet, doneSetCount, doneSetsText, exercisesWithSetsText } from "./active-workout";

describe("doneSetCount", () => {
  it("counts the sets with a value", () => {
    const sets = makeWorkoutExercise({ reps: [10, 0, 8], weights: [50, 0, 0] });
    expect(doneSetCount(sets, false, 0)).toBe(2);
  });

  it("counts a unilateral set once if either side has a value", () => {
    const sets = makeWorkoutExercise({ unilateral: true, reps: [10, 0, 0, 0, 0, 8], weights: [0, 0, 0, 0, 0, 0] });
    expect(doneSetCount(sets, false, 0)).toBe(2);
  });

  it("doesn't count the bodyweight of a bodyweight exercise", () => {
    const sets = makeWorkoutExercise({ reps: [0, 5], weights: [80, 80] });
    expect(doneSetCount(sets, true, 80)).toBe(1);
    expect(doneSetCount(sets, false, 80)).toBe(2);
  });
});

describe("texts", () => {
  it("names the done sets", () => {
    expect(doneSetsText(0)).toBe("Empty");
    expect(doneSetsText(1)).toBe("1 set");
    expect(doneSetsText(4)).toBe("4 sets");
  });

  it("counts the exercises with sets", () => {
    expect(exercisesWithSetsText(0, 1)).toBe("0 of 1 exercise has sets");
    expect(exercisesWithSetsText(2, 3)).toBe("2 of 3 exercises have sets");
  });
});

describe("canRemoveSet", () => {
  it("keeps one set", () => {
    expect(canRemoveSet(makeWorkoutExercise({ reps: [1], weights: [0] }))).toBe(false);
    expect(canRemoveSet(makeWorkoutExercise({ reps: [1, 2], weights: [0, 0] }))).toBe(true);
    expect(canRemoveSet(makeWorkoutExercise({ unilateral: true, reps: [1, 2], weights: [0, 0] }))).toBe(false);
    expect(canRemoveSet(makeWorkoutExercise({ unilateral: true, reps: [1, 2, 3, 4], weights: [0, 0, 0, 0] }))).toBe(true);
  });
});
