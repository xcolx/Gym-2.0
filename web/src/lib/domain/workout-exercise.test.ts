import { describe, expect, it } from "vitest";

import { makeExercise } from "@/test/fixtures";
import { UnitSystem } from "@/types/models";
import {
  appendEntry,
  convertEntries,
  entryCount,
  entryDescription,
  isEntryEmpty,
  numberOfSets,
  removeEntry,
  startSets,
  trackedMetrics,
  volume,
  withValue,
  type SetArrays,
} from "./workout-exercise";

const sets = (overrides: Partial<SetArrays>): SetArrays => ({
  reps: null,
  weights: null,
  time: null,
  intensity: null,
  distance: null,
  ...overrides,
});

describe("set arrays", () => {
  it("starts with one empty entry per tracked metric, two if unilateral", () => {
    const exercise = makeExercise({ tracksReps: true, tracksWeights: true, tracksTime: true });
    expect(startSets(exercise, false, 80)).toEqual(sets({ reps: [0], weights: [80], time: [0] }));
    expect(entryCount(startSets(exercise, true, 0))).toBe(2);
  });

  it("appends and removes entries in every tracked metric", () => {
    const start = sets({ reps: [10], weights: [50] });
    expect(appendEntry(start, 0)).toEqual(sets({ reps: [10, 0], weights: [50, 0] }));
    expect(removeEntry(sets({ reps: [1, 2, 3], weights: [4, 5, 6] }), 1)).toEqual(sets({ reps: [1, 3], weights: [4, 6] }));
  });

  it("counts sets, a unilateral set has two entries", () => {
    expect(numberOfSets({ ...sets({ reps: [1, 2, 3, 4] }), unilateral: false })).toBe(4);
    expect(numberOfSets({ ...sets({ reps: [1, 2, 3, 4] }), unilateral: true })).toBe(2);
  });

  it("converts the entries when switching unilateral", () => {
    const bilateral = sets({ reps: [10, 8], weights: [50, 60] });
    const unilateral = convertEntries(bilateral, true);
    expect(unilateral).toEqual(sets({ reps: [10, 0, 8, 0], weights: [50, 0, 60, 0] }));
    expect(convertEntries(unilateral, false)).toEqual(bilateral);
  });

  it("rounds reps and time and ignores untracked metrics", () => {
    const start = sets({ reps: [0], weights: [0] });
    expect(withValue(start, "reps", 0, 7.5).reps).toEqual([8]);
    expect(withValue(start, "weights", 0, 7.5).weights).toEqual([7.5]);
    expect(withValue(start, "time", 0, 30)).toBe(start);
  });

  it("treats the unchanged bodyweight as not entered", () => {
    const entry = sets({ reps: [0], weights: [80] });
    expect(isEntryEmpty(entry, 0, true, 80)).toBe(true);
    expect(isEntryEmpty(entry, 0, false, 80)).toBe(false);
    expect(isEntryEmpty(sets({ reps: [1], weights: [80] }), 0, true, 80)).toBe(false);
  });

  it("knows the tracked metrics and the volume", () => {
    const entry = sets({ reps: [10, 5], weights: [50, 100] });
    expect(trackedMetrics(entry)).toEqual(["reps", "weights"]);
    expect(volume(entry)).toBe(1000);
    expect(volume(sets({ reps: [10] }))).toBe(0);
  });

  it("describes an entry in the units of the user", () => {
    const entry = { ...sets({ reps: [10, 9], weights: [50, 50] }), unilateral: true };
    expect(entryDescription(entry, 0, UnitSystem.metric, UnitSystem.metric)).toBe("R 10x, 50.0 kg");
    expect(entryDescription(entry, 1, UnitSystem.metric, UnitSystem.metric)).toBe("L 9x, 50.0 kg");
    const run = { ...sets({ time: [90], distance: [1500] }), unilateral: false };
    expect(entryDescription(run, 0, UnitSystem.metric, UnitSystem.metric)).toBe("1:30, 1.5 km");
  });
});
