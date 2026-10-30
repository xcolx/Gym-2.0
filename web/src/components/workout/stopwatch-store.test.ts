import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KEY = "gym2.stopwatches";
let values: Map<string, string>;

function stubSessionStorage() {
  vi.stubGlobal("window", {
    sessionStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
    },
  });
}

/** The module keeps the stopwatches of the page, every test loads it again */
const load = () => import("./stopwatch-store");

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 21, 12, 0));
  values = new Map();
  stubSessionStorage();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const set = { workoutId: "w", workoutExerciseId: "we", entryIndex: 0 };

describe("stopwatch store", () => {
  it("runs from the time of the field and takes the seconds over when stopped", async () => {
    const { startSetStopwatch, pauseSetStopwatch, stopSetStopwatch } = await load();
    startSetStopwatch(set, 10);
    vi.advanceTimersByTime(5_400);
    pauseSetStopwatch(set, 0);
    vi.advanceTimersByTime(60_000);
    expect(JSON.parse(values.get(KEY)!)).toEqual({ "w/we/0": { accumulated: 15.4, startedAt: null } });

    startSetStopwatch(set, 0);
    vi.advanceTimersByTime(1_000);
    expect(stopSetStopwatch(set, 0)).toBe(16);
    expect(JSON.parse(values.get(KEY)!)).toEqual({});
  });

  it("stops a set without a stopwatch at the time of the field", async () => {
    const { stopSetStopwatch } = await load();
    expect(stopSetStopwatch(set, 42)).toBe(42);
  });

  it("keeps running after a reload of the page", async () => {
    (await load()).startSetStopwatch(set, 0);
    vi.advanceTimersByTime(30_000);

    vi.resetModules();
    const { stopSetStopwatch } = await load();
    expect(stopSetStopwatch(set, 0)).toBe(30);
  });

  it("removes the stopwatches of one workout only", async () => {
    const { startSetStopwatch, clearWorkoutStopwatches } = await load();
    startSetStopwatch(set, 0);
    startSetStopwatch({ ...set, entryIndex: 1 }, 0);
    startSetStopwatch({ ...set, workoutId: "w2" }, 0);
    // a workout whose id starts like another one's
    startSetStopwatch({ ...set, workoutId: "w-long" }, 0);
    clearWorkoutStopwatches("w");
    expect(Object.keys(JSON.parse(values.get(KEY)!)).sort()).toEqual(["w-long/we/0", "w2/we/0"]);

    const writes = values.get(KEY);
    clearWorkoutStopwatches("unknown");
    expect(values.get(KEY)).toBe(writes);
  });

  it("starts empty with stored values it can't read and works without storage", async () => {
    values.set(KEY, "{broken");
    const { stopSetStopwatch, startSetStopwatch } = await load();
    expect(stopSetStopwatch(set, 3)).toBe(3);

    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: () => null,
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
      },
    });
    startSetStopwatch(set, 0);
    vi.advanceTimersByTime(2_000);
    expect(stopSetStopwatch(set, 0)).toBe(2);
  });
});
