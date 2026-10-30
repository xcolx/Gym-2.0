import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearWorkoutLastChange, recordWorkoutChange, workoutLastChange } from "./workout-last-change";

const KEY = "gym2.workoutLastChange";
let values: Map<string, string>;

beforeEach(() => {
  values = new Map();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
    },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("workout last change", () => {
  it("records the last change per workout", () => {
    expect(workoutLastChange("a")).toBeNull();
    recordWorkoutChange("a", new Date(2026, 9, 21, 10, 0));
    recordWorkoutChange("b", new Date(2026, 9, 21, 11, 0));
    recordWorkoutChange("a", new Date(2026, 9, 21, 12, 0));
    expect(workoutLastChange("a")).toEqual(new Date(2026, 9, 21, 12, 0));
    expect(workoutLastChange("b")).toEqual(new Date(2026, 9, 21, 11, 0));
  });

  it("forgets the change of one workout", () => {
    recordWorkoutChange("a", new Date(2026, 9, 21, 10, 0));
    recordWorkoutChange("b", new Date(2026, 9, 21, 11, 0));
    clearWorkoutLastChange("a");
    expect(workoutLastChange("a")).toBeNull();
    expect(workoutLastChange("b")).not.toBeNull();
    const writes = values.get(KEY);
    clearWorkoutLastChange("unknown");
    expect(values.get(KEY)).toBe(writes);
  });

  it("ignores stored values it can't read", () => {
    values.set(KEY, "{broken");
    expect(workoutLastChange("a")).toBeNull();
    values.set(KEY, "null");
    expect(workoutLastChange("a")).toBeNull();
    values.set(KEY, JSON.stringify({ a: "yesterday" }));
    expect(workoutLastChange("a")).toBeNull();
    recordWorkoutChange("a", new Date(2026, 9, 21));
    expect(workoutLastChange("a")).toEqual(new Date(2026, 9, 21));
  });

  it("works without storage, the workout then ends now", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(() => recordWorkoutChange("a")).not.toThrow();
    expect(workoutLastChange("a")).toBeNull();
  });

  it("does nothing on the server", () => {
    vi.stubGlobal("window", undefined);
    expect(() => recordWorkoutChange("a")).not.toThrow();
    expect(workoutLastChange("a")).toBeNull();
    expect(() => clearWorkoutLastChange("a")).not.toThrow();
  });
});
