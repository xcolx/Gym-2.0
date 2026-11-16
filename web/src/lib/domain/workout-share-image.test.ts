import { describe, expect, it } from "vitest";

import { makeExercise, makeWorkoutWithExercises } from "@/test/fixtures";
import { UnitSystem, type Exercise, type WorkoutExercise } from "@/types/models";
import {
  moreExercisesText,
  shareImageSetLines,
  workoutShareImageContent,
  workoutShareImageFileName,
} from "./workout-share-image";

const metric = { weightUnit: UnitSystem.metric, distanceUnit: UnitSystem.metric };

/** A workout with `count` exercises of `sets` sets each */
const workoutWith = (count: number, sets = 2) =>
  makeWorkoutWithExercises(
    { name: "Push", date: new Date(2026, 9, 12, 18, 30), duration: 75 },
    Array.from({ length: count }, (_, index): [Exercise, Partial<WorkoutExercise>] => [
      makeExercise({ name: `Exercise ${index + 1}` }),
      { reps: Array.from({ length: sets }, () => 10), weights: Array.from({ length: sets }, () => 60) },
    ]),
  );

describe("workoutShareImageContent (WorkoutShareImageContent)", () => {
  it("shows the name, the date and the totals without the date", () => {
    const content = workoutShareImageContent(workoutWith(2), metric, "en-GB");
    expect(content.name).toBe("Push");
    // The punctuation depends on the version of the locale data
    expect(content.date).toMatch(/^Monday,? 12 October 2026 at 18:30$/);
    expect(content.lines).toEqual([
      { title: "Time trained", value: "1 h 15 min" },
      { title: "Sets", value: "4" },
      { title: "Reps", value: "40" },
      { title: "Volume", value: "2.4k kg" },
    ]);
  });

  it("lists the exercises in the order of the workout with their sets", () => {
    const lunge = makeExercise({ name: "Lunge" });
    const plank = makeExercise({ name: "Plank", tracksReps: false, tracksWeights: false, tracksTime: true });
    const workout = makeWorkoutWithExercises({}, [
      [plank, { index: 1, time: [60] }],
      [lunge, { index: 0, unilateral: true, reps: [10, 8], weights: [20, 20] }],
    ]);
    expect(workoutShareImageContent(workout, metric).columns).toEqual([
      [
        { number: 1, name: "Lunge", lines: ["R 10x, 20.0 kg", "L 8x, 20.0 kg"] },
        { number: 2, name: "Plank", lines: ["1:00"] },
      ],
    ]);
  });

  it("leaves out the sets after the first four of an exercise with more than five", () => {
    expect(shareImageSetLines(["a", "b", "c", "d", "e"])).toEqual(["a", "b", "c", "d", "e"]);
    expect(shareImageSetLines(["a", "b", "c", "d", "e", "f", "g"])).toEqual(["a", "b", "c", "d", "+ 3 more"]);
  });

  it("has no column without exercises", () => {
    expect(workoutShareImageContent(workoutWith(0), metric).columns).toEqual([]);
  });

  it("adds a column when the ones before are full", () => {
    // An exercise with 2 sets is 68 high, with the gap of 14 seven fit in the 568 of a column
    const sizes = (count: number, sets = 2) =>
      workoutShareImageContent(workoutWith(count, sets), metric).columns.map((column) => column.length);
    expect(sizes(7)).toEqual([7]);
    expect(sizes(8)).toEqual([7, 1]);
    expect(sizes(21)).toEqual([7, 7, 7]);
    // With the most lines (128 high) four fit
    expect(sizes(10, 9)).toEqual([4, 4, 2]);
  });

  it("counts the exercises that don't fit", () => {
    expect(workoutShareImageContent(workoutWith(21), metric).moreExercises).toBe(0);
    const tooMany = workoutShareImageContent(workoutWith(24), metric);
    expect(tooMany.columns.flat().map((exercise) => exercise.number)).toEqual(Array.from({ length: 21 }, (_, i) => i + 1));
    expect(tooMany.moreExercises).toBe(3);
  });
});

describe("moreExercisesText", () => {
  it("is only shown if exercises are left out", () => {
    expect(moreExercisesText(0)).toBeNull();
    expect(moreExercisesText(1)).toBe("+ 1 more exercise");
    expect(moreExercisesText(3)).toBe("+ 3 more exercises");
  });
});

describe("workoutShareImageFileName", () => {
  it("is the name of the workout", () => {
    expect(workoutShareImageFileName("Push day")).toBe("Push day.png");
  });

  it("leaves out what a file name can't have", () => {
    expect(workoutShareImageFileName(' Legs / Core: "heavy"? ')).toBe("Legs Core heavy.png");
    expect(workoutShareImageFileName(" /// ")).toBe("Workout.png");
  });
});
