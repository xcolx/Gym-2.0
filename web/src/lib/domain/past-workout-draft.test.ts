import { describe, expect, it } from "vitest";

import { makeExercise, makeWorkoutWithExercises } from "@/test/fixtures";
import {
  addSetChanges,
  changingRow,
  dayInputValue,
  movedRow,
  removeLastSetChanges,
  setValueChanges,
  unilateralChanges,
  withDay,
  withoutRow,
} from "./past-workout-draft";

const bench = makeExercise({ name: "Bench Press" });
const squat = makeExercise({ name: "Squat" });
const curl = makeExercise({ name: "Curl" });

function workout() {
  return makeWorkoutWithExercises({}, [
    [bench, { reps: [10, 8], weights: [60, 60] }],
    [squat, { reps: [5], weights: [100] }],
    [curl, { reps: [12, 12], weights: [10, 10], unilateral: true }],
  ]);
}

describe("dayInputValue and withDay", () => {
  it("formats the local day with leading zeros", () => {
    expect(dayInputValue(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
  });

  it("changes the day and keeps the time", () => {
    const start = new Date(2026, 9, 12, 18, 15);
    const now = new Date(2026, 9, 20).getTime();
    expect(withDay(start, "2026-10-03", now)).toEqual(new Date(2026, 9, 3, 18, 15));
  });

  it("ignores an empty or invalid value and days in the future", () => {
    const start = new Date(2026, 9, 12, 18, 15);
    const now = new Date(2026, 9, 20, 12, 0).getTime();
    expect(withDay(start, "", now)).toBeNull();
    expect(withDay(start, "2026-10", now)).toBeNull();
    expect(withDay(start, "2026-10-21", now)).toBeNull();
    // The same day, but the time of the start is later than now
    expect(withDay(start, "2026-10-20", now)).toBeNull();
  });
});

describe("the exercises of the draft", () => {
  it("removes an exercise and reindexes the rest", () => {
    const rows = withoutRow(workout().workoutExercises, 0);
    expect(rows.map((row) => [row.exercise?.name, row.index])).toEqual([
      ["Squat", 0],
      ["Curl", 1],
    ]);
  });

  it("moves an exercise and reindexes all", () => {
    const rows = movedRow(workout().workoutExercises, 2, 0);
    expect(rows.map((row) => [row.exercise?.name, row.index])).toEqual([
      ["Curl", 0],
      ["Bench Press", 1],
      ["Squat", 2],
    ]);
  });

  it("changes only the row with the id, and keeps it without changes", () => {
    const draft = workout();
    const [first, second] = draft.workoutExercises;
    const changed = changingRow(draft, first.id, () => ({ reps: [1, 1] }));
    expect(changed.workoutExercises[0].reps).toEqual([1, 1]);
    expect(changed.workoutExercises[1]).toBe(second);
    expect(changingRow(draft, first.id, () => null).workoutExercises[0]).toBe(first);
  });
});

describe("the sets of a draft row", () => {
  it("adds one entry, two for unilateral exercises", () => {
    const [benchRow, , curlRow] = workout().workoutExercises;
    expect(addSetChanges(benchRow, 70)).toMatchObject({ reps: [10, 8, 0], weights: [60, 60, 70] });
    expect(addSetChanges(curlRow, 0)).toMatchObject({ reps: [12, 12, 0, 0], weights: [10, 10, 0, 0] });
  });

  it("removes the last set but never the only one", () => {
    const [benchRow, squatRow, curlRow] = workout().workoutExercises;
    expect(removeLastSetChanges(benchRow)).toMatchObject({ reps: [10], weights: [60] });
    expect(removeLastSetChanges(squatRow)).toBeNull();
    expect(removeLastSetChanges(curlRow)).toBeNull();
    expect(removeLastSetChanges({ ...curlRow, reps: [1, 2, 3, 4], weights: [5, 6, 7, 8] })).toMatchObject({
      reps: [1, 2],
      weights: [5, 6],
    });
  });

  it("sets a value of an existing entry of a tracked metric", () => {
    const [benchRow] = workout().workoutExercises;
    expect(setValueChanges(benchRow, "reps", 1, 9)).toMatchObject({ reps: [10, 9] });
    expect(setValueChanges(benchRow, "reps", 2, 9)).toBeNull();
    expect(setValueChanges(benchRow, "reps", -1, 9)).toBeNull();
    expect(setValueChanges(benchRow, "time", 0, 9)).toBeNull();
  });

  it("converts the entries when unilateral changes", () => {
    const [benchRow] = workout().workoutExercises;
    expect(unilateralChanges(benchRow, false)).toBeNull();
    const changes = unilateralChanges(benchRow, true);
    expect(changes?.unilateral).toBe(true);
    expect(changes?.reps).toHaveLength(4);
  });
});
