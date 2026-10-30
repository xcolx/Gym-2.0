import { describe, expect, it } from "vitest";

import { makeExercise, makeWorkout, makeWorkoutExercise, makeWorkoutWithExercises, muscles, reference } from "@/test/fixtures";
import { formatDate, roundHalfAwayFromZero, startOfWeek, timeFromDate } from "./format";
import { notTrainedMuscles, progressPercentage, timeWorkedOutShort } from "./home";
import { suggestExercises, suggestedExerciseCount } from "./suggest";
import { durationInput, isInCurrentWeek, isRecent, musclesTrained, planFinishWorkout, suggestedWorkoutEnd } from "./workout";

describe("musclesTrained", () => {
  it("lists primary muscles and the muscles only trained as secondary muscle", () => {
    const bench = makeExercise({ primaryMuscleIds: [1], secondaryMuscleIds: [2, 3] });
    const dips = makeExercise({ primaryMuscleIds: [2] });
    const [primary, secondary] = musclesTrained([makeWorkoutWithExercises({}, [[bench, {}], [dips, {}]])], reference);
    expect(primary.map((m) => m.name)).toEqual(["Chest", "Triceps"]);
    expect(secondary.map((m) => m.name)).toEqual(["Front Deltoid"]);
  });

  it("counts a muscle trained as secondary muscle in three exercises as primary", () => {
    const fly = makeExercise({ primaryMuscleIds: [1], secondaryMuscleIds: [3] });
    const workout = makeWorkoutWithExercises({}, [[fly, {}], [fly, {}], [fly, {}]]);
    const [primary, secondary] = musclesTrained([workout], reference);
    expect(primary.map((m) => m.name)).toEqual(["Chest", "Front Deltoid"]);
    expect(secondary).toEqual([]);
  });

  it("lists a muscle trained as secondary muscle in two exercises once", () => {
    const fly = makeExercise({ primaryMuscleIds: [1], secondaryMuscleIds: [3] });
    const [primary, secondary] = musclesTrained([makeWorkoutWithExercises({}, [[fly, {}], [fly, {}]])], reference);
    expect(primary.map((m) => m.name)).toEqual(["Chest"]);
    expect(secondary.map((m) => m.name)).toEqual(["Front Deltoid"]);
  });
});

describe("suggestedWorkoutEnd", () => {
  const workout = makeWorkout({ date: new Date(2026, 9, 12, 18, 0) });
  const now = new Date(2026, 9, 13, 9, 0);

  it("suggests the last change if it was more than 5 minutes ago", () => {
    const lastChange = new Date(2026, 9, 12, 19, 10);
    expect(suggestedWorkoutEnd(workout, lastChange, now)).toEqual(lastChange);
    expect(suggestedWorkoutEnd(workout, new Date(2026, 9, 13, 8, 54, 59), now)).not.toBeNull();
  });

  it("suggests nothing for a recent, missing or earlier last change", () => {
    expect(suggestedWorkoutEnd(workout, new Date(2026, 9, 13, 8, 55), now)).toBeNull();
    expect(suggestedWorkoutEnd(workout, null, now)).toBeNull();
    expect(suggestedWorkoutEnd(workout, new Date(2026, 9, 12, 17, 0), now)).toBeNull();
  });
});

describe("planFinishWorkout", () => {
  const workout = makeWorkout({ id: "w", date: new Date(2026, 9, 12, 18, 0) });
  const now = new Date(2026, 9, 12, 19, 5, 30);

  it("removes the empty entries and exercises and reindexes the rest", () => {
    const empty = makeWorkoutExercise({ id: "a", workoutId: "w", index: 0, reps: [0], weights: [0] });
    const done = makeWorkoutExercise({ id: "b", workoutId: "w", index: 1, reps: [10, 0, 8], weights: [50, 0, 50] });
    const plan = planFinishWorkout(workout, [done, empty], () => false, 80, now);
    expect(plan.duration).toBe(65);
    expect(plan.deletedIds).toEqual(["a"]);
    expect(plan.deleteWorkout).toBe(false);
    expect(plan.kept).toEqual([
      { id: "b", index: 0, reps: [10, 8], weights: [50, 50], time: null, intensity: null, distance: null },
    ]);
  });

  it("removes unilateral sets only if both sides are empty", () => {
    const unilateral = makeWorkoutExercise({
      id: "u",
      workoutId: "w",
      unilateral: true,
      reps: [10, 0, 0, 0, 0, 8],
      weights: [20, 20, 0, 0, 0, 20],
    });
    const plan = planFinishWorkout(workout, [unilateral], () => false, 80, now);
    expect(plan.kept[0].reps).toEqual([10, 0, 0, 8]);
  });

  it("keeps the bodyweight of bodyweight exercises as not entered", () => {
    const pullUps = makeWorkoutExercise({ id: "p", workoutId: "w", reps: [0, 5], weights: [80, 80] });
    const plan = planFinishWorkout(workout, [pullUps], () => true, 80, now);
    expect(plan.kept[0].reps).toEqual([5]);
  });

  it("deletes the workout if nothing was entered", () => {
    const empty = makeWorkoutExercise({ id: "a", workoutId: "w", reps: [0], weights: [0] });
    const plan = planFinishWorkout(workout, [empty], () => false, 80, now);
    expect(plan.deleteWorkout).toBe(true);
    expect(plan.deletedIds).toEqual(["a"]);
  });
});

describe("weeks", () => {
  it("starts the week at midnight of the first weekday", () => {
    const thursday = new Date(2026, 9, 15, 12, 0);
    expect(startOfWeek(thursday, 1)).toEqual(new Date(2026, 9, 12, 0, 0));
    expect(startOfWeek(thursday, 0)).toEqual(new Date(2026, 9, 11, 0, 0));
  });

  it("only counts finished workouts of the current week", () => {
    const now = new Date(2026, 9, 15, 12, 0);
    expect(isInCurrentWeek(makeWorkout({ date: new Date(2026, 9, 13) }), now, 1)).toBe(true);
    expect(isInCurrentWeek(makeWorkout({ date: new Date(2026, 9, 13), inProgress: true }), now, 1)).toBe(false);
    expect(isInCurrentWeek(makeWorkout({ date: new Date(2026, 9, 11) }), now, 1)).toBe(false);
  });
});

describe("recent days", () => {
  it("counts finished workouts of today and the two days before, across week borders", () => {
    // Monday, the workouts of the weekend before still count
    const now = new Date(2026, 9, 12, 8, 0);
    expect(isRecent(makeWorkout({ date: new Date(2026, 9, 10, 0, 0) }), now)).toBe(true);
    expect(isRecent(makeWorkout({ date: new Date(2026, 9, 11, 18, 0) }), now)).toBe(true);
    expect(isRecent(makeWorkout({ date: new Date(2026, 9, 9, 23, 59) }), now)).toBe(false);
    expect(isRecent(makeWorkout({ date: new Date(2026, 9, 12, 7, 0), inProgress: true }), now)).toBe(false);
  });
});

describe("general functions", () => {
  it("formats dates and times like DateFormatting.swift", () => {
    const date = new Date(2026, 0, 5, 8, 7);
    expect(formatDate(date)).toBe("05.01.26");
    expect(timeFromDate(date)).toBe("08:07");
  });

  it("rounds half away from zero like Swift", () => {
    expect(roundHalfAwayFromZero(2.5)).toBe(3);
    expect(roundHalfAwayFromZero(-2.5)).toBe(-3);
    expect(roundHalfAwayFromZero(2.4)).toBe(2);
  });
});

describe("home", () => {
  it("shortens the time worked out", () => {
    expect(timeWorkedOutShort([makeWorkout({ duration: 45 })])).toBe("45 min");
    expect(timeWorkedOutShort([makeWorkout({ duration: 90 })])).toBe("1.5 h");
    expect(timeWorkedOutShort([makeWorkout({ duration: 598 })])).toBe("10 h");
  });

  it("calculates the progress of the week", () => {
    expect(progressPercentage([[muscles[0], muscles[1]], [muscles[2]]], muscles)).toBe(58);
    expect(progressPercentage([[], []], [])).toBe(0);
    expect(notTrainedMuscles([[muscles[0]], []], muscles).map((m) => m.name)).toEqual(["Triceps", "Front Deltoid", "Quads"]);
  });
});

describe("suggestExercises", () => {
  it("fits the number of exercises to the time", () => {
    expect(suggestedExerciseCount(15)).toBe(2);
    expect(suggestedExerciseCount(60)).toBe(5);
    expect(suggestedExerciseCount(90)).toBe(6);
  });

  it("prefers exercises of muscles that weren't trained and only uses the available equipment", () => {
    const chest = makeExercise({ name: "Chest", equipmentId: 1, primaryMuscleIds: [1] });
    const legs = makeExercise({ name: "Legs", equipmentId: 1, primaryMuscleIds: [4] });
    const body = makeExercise({ name: "Body", equipmentId: 2, primaryMuscleIds: [4] });
    const result = suggestExercises([chest, legs, body], new Set([1]), 15, [muscles[0]], () => 0);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(legs);
    expect(result).toContain(chest);
    expect(result).not.toContain(body);
  });
});

describe("durationInput", () => {
  it("stores the entered minutes, nothing while the field is empty", () => {
    expect(durationInput("45")).toEqual({ text: "45", minutes: 45 });
    expect(durationInput("0")).toEqual({ text: "0", minutes: 0 });
    expect(durationInput("")).toEqual({ text: "", minutes: null });
  });

  it("cuts a duration longer than the server stores to 1440 minutes right away", () => {
    expect(durationInput("1440")).toEqual({ text: "1440", minutes: 1440 });
    expect(durationInput("5000")).toEqual({ text: "1440", minutes: 1440 });
    expect(durationInput("9".repeat(400))).toEqual({ text: "1440", minutes: 1440 });
  });

  it("rejects text that isn't a number", () => {
    expect(durationInput("12a")).toBeNull();
    expect(durationInput("-5")).toBeNull();
    expect(durationInput("1.5")).toBeNull();
  });
});
