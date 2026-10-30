import { describe, expect, it } from "vitest";

import { makeExercise, muscles } from "@/test/fixtures";
import { suggestedExerciseCount, suggestExercises } from "./suggest";

/** A deterministic random number generator */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2 ** 31;
    return state / 2 ** 31;
  };
}

const chest = makeExercise({ name: "Bench", equipmentId: 1, primaryMuscleIds: [1] });
const triceps = makeExercise({ name: "Dips", equipmentId: 2, primaryMuscleIds: [2] });
const shoulders = makeExercise({ name: "Press", equipmentId: 1, primaryMuscleIds: [3] });
const legs = makeExercise({ name: "Squat", equipmentId: 1, primaryMuscleIds: [4] });
const pullUps = makeExercise({ name: "Pull Ups", equipmentId: 3, primaryMuscleIds: [2] });
const all = [chest, triceps, shoulders, legs, pullUps];

describe("suggestedExerciseCount", () => {
  it("uses the counts of the iOS app and a quarter of an hour per exercise otherwise", () => {
    expect([15, 30, 45, 60].map(suggestedExerciseCount)).toEqual([2, 3, 4, 5]);
    expect(suggestedExerciseCount(90)).toBe(6);
    expect(suggestedExerciseCount(20)).toBe(1);
    expect(suggestedExerciseCount(10)).toBe(0);
  });
});

describe("suggestExercises", () => {
  it("only suggests exercises of the available equipment", () => {
    for (let seed = 1; seed < 20; seed++) {
      const suggested = suggestExercises(all, new Set([1]), 60, [], seeded(seed));
      expect(new Set(suggested)).toEqual(new Set([chest, shoulders, legs]));
    }
  });

  it("prefers exercises for muscles not trained this week", () => {
    for (let seed = 1; seed < 20; seed++) {
      const suggested = suggestExercises(all, new Set([1, 2, 3]), 15, [muscles[0], muscles[1]], seeded(seed));
      expect(suggested).toHaveLength(2);
      expect(new Set(suggested)).toEqual(new Set([shoulders, legs]));
    }
  });

  it("fills up with trained ones without repeating an exercise", () => {
    for (let seed = 1; seed < 20; seed++) {
      const suggested = suggestExercises(all, new Set([1]), 45, [muscles[0]], seeded(seed));
      expect(suggested).toHaveLength(3);
      expect(suggested.slice(0, 2)).toEqual(expect.arrayContaining([shoulders, legs]));
      expect(suggested[2]).toBe(chest);
    }
  });

  it("shuffles the order", () => {
    const orders = new Set(
      Array.from({ length: 30 }, (_, seed) => suggestExercises(all, new Set([1, 2, 3]), 60, [], seeded(seed + 1)).map((e) => e.name).join()),
    );
    expect(orders.size).toBeGreaterThan(1);
  });

  it("suggests nothing without equipment", () => {
    expect(suggestExercises(all, new Set(), 60, [])).toEqual([]);
  });
});
