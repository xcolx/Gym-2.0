import { describe, expect, it } from "vitest";

import { makeExercise, makeWorkoutExercise, makeWorkoutWithExercises } from "@/test/fixtures";
import { UnitSystem } from "@/types/models";
import {
  formatDuration,
  formatIntensity,
  formatRecord,
  formatSetTime,
  formatTime,
  metricAverage,
  summaryOfWorkoutExercises,
  summaryOfWorkouts,
} from "./stats";

describe("summaryOfWorkouts", () => {
  const bench = makeExercise({ name: "Bench Press" });
  const run = makeExercise({ name: "Run", tracksReps: false, tracksWeights: false, tracksTime: true, tracksDistance: true });

  const workouts = [
    makeWorkoutWithExercises({ duration: 60 }, [
      [bench, { reps: [10, 8, 0], weights: [50, 60, 70] }],
      [run, { time: [600], distance: [2000] }],
    ]),
    makeWorkoutWithExercises({ duration: 45 }, [[bench, { reps: [5, 5, 3, 3], weights: [60, 60, 70, 70], unilateral: true }]]),
  ];

  it("sums the workouts, durations, sets and metrics", () => {
    const summary = summaryOfWorkouts(workouts);
    expect(summary.workouts).toBe(2);
    expect(summary.duration).toBe(105);
    // 3 + 1 + 2 (four unilateral entries are two sets)
    expect(summary.sets).toBe(6);
    expect(summary.reps.total).toBe(34);
    expect(summary.volume).toBe(10 * 50 + 8 * 60 + 5 * 60 + 5 * 60 + 3 * 70 + 3 * 70);
    expect(summary.distance).toMatchObject({ isTracked: true, total: 2000, count: 1, max: 2000 });
    expect(summary.intensity.isTracked).toBe(false);
  });

  it("averages only the entries with a value", () => {
    const summary = summaryOfWorkouts(workouts);
    // the 0 reps entry is left out
    expect(summary.reps.count).toBe(6);
    expect(metricAverage(summary.reps)).toBeCloseTo(34 / 6);
    expect(metricAverage(summary.intensity)).toBeNull();
  });

  it("finds the heaviest weight with the most reps as personal record", () => {
    const summary = summaryOfWorkouts(workouts);
    expect(summary.personalRecord).toEqual({ weight: 70, reps: 3 });
  });

  it("counts the workouts of single workout exercises", () => {
    const summary = summaryOfWorkoutExercises([
      makeWorkoutExercise({ workoutId: "a", reps: [1], weights: [10] }),
      makeWorkoutExercise({ workoutId: "a", reps: [2], weights: [20] }),
      makeWorkoutExercise({ workoutId: "b", reps: [3], weights: [30] }),
    ]);
    expect(summary.workouts).toBe(2);
    expect(summary.duration).toBe(0);
  });
});

describe("formatting", () => {
  it("formats durations and times", () => {
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(65)).toBe("1 h 5 min");
    expect(formatTime(45)).toBe("45 s");
    expect(formatTime(120)).toBe("2 min");
    expect(formatTime(125)).toBe("2 min 5 s");
    expect(formatTime(3720)).toBe("1 h 2 min");
  });

  it("formats the time of a set", () => {
    expect(formatSetTime(45)).toBe("0:45");
    expect(formatSetTime(90)).toBe("1:30");
    expect(formatSetTime(3600)).toBe("1:00:00");
  });

  it("formats intensities and records", () => {
    expect(formatIntensity(5.5)).toBe("lvl 5.5");
    expect(formatIntensity(5)).toBe("lvl 5");
    expect(formatRecord({ weight: 100, reps: 10 }, UnitSystem.metric)).toBe("10x 100.0 kg");
    expect(formatRecord({ weight: 100, reps: 0 }, UnitSystem.metric)).toBe("100.0 kg");
  });
});
