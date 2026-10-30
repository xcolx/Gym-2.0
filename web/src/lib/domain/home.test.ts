import { describe, expect, it } from "vitest";

import { makeWorkout, muscles } from "@/test/fixtures";
import { notTrainedMuscles, progressPercentage, timeWorkedOutShort } from "./home";

const workouts = (...durations: number[]) => durations.map((duration) => makeWorkout({ duration }));

describe("timeWorkedOutShort", () => {
  it("shows minutes below an hour, then hours with one decimal below ten", () => {
    expect(timeWorkedOutShort([])).toBe("0 min");
    expect(timeWorkedOutShort(workouts(20, 25))).toBe("45 min");
    expect(timeWorkedOutShort(workouts(60))).toBe("1.0 h");
    expect(timeWorkedOutShort(workouts(90, 60))).toBe("2.5 h");
    expect(timeWorkedOutShort(workouts(597))).toBe("9.9 h");
  });

  it("shows whole hours from almost ten hours on instead of 10.0", () => {
    expect(timeWorkedOutShort(workouts(598))).toBe("10 h");
    expect(timeWorkedOutShort(workouts(600, 120))).toBe("12 h");
  });
});

describe("progressPercentage", () => {
  it("is 0 before the reference data is loaded", () => {
    expect(progressPercentage([[muscles[0]], []], [])).toBe(0);
  });

  it("counts a secondary muscle a third", () => {
    expect(progressPercentage([[], []], muscles)).toBe(0);
    expect(progressPercentage([muscles, []], muscles)).toBe(100);
    expect(progressPercentage([[muscles[0]], []], muscles)).toBe(25);
    // (1 + 0.33 * 2) / 4
    expect(progressPercentage([[muscles[0]], [muscles[1], muscles[2]]], muscles)).toBe(41);
  });
});

describe("notTrainedMuscles", () => {
  it("lists the muscles not trained as primary muscle in their order", () => {
    expect(notTrainedMuscles([[muscles[1]], [muscles[0]]], muscles).map((muscle) => muscle.name)).toEqual([
      "Chest",
      "Front Deltoid",
      "Quads",
    ]);
  });
});
