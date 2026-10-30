import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KEY = "gym2.shownWorkout";
let values: Map<string, string>;

const load = () => import("./workout-navigation");

beforeEach(() => {
  vi.resetModules();
  values = new Map();
  vi.stubGlobal("window", {
    sessionStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
    },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("shown workout", () => {
  it("is kept in the session storage, so a reload shows it again", async () => {
    const first = await load();
    expect(first.getShownWorkout()).toBeNull();
    first.setShownWorkout("w1");
    expect(values.get(KEY)).toBe("w1");

    vi.resetModules();
    const reloaded = await load();
    expect(reloaded.getShownWorkout()).toBe("w1");
    reloaded.setShownWorkout(null);
    expect(values.has(KEY)).toBe(false);
    expect(reloaded.getShownWorkout()).toBeNull();
  });

  it("works without storage within the page", async () => {
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
    });
    const navigation = await load();
    expect(navigation.getShownWorkout()).toBeNull();
    navigation.setShownWorkout("w1");
    expect(navigation.getShownWorkout()).toBe("w1");
  });

  it("remembers whether the workout was opened since the tab was entered", async () => {
    const navigation = await load();
    expect(navigation.wasOpenedSinceTabEntered()).toBe(false);
    navigation.setOpenedSinceTabEntered(true);
    expect(navigation.wasOpenedSinceTabEntered()).toBe(true);
  });
});

describe("celebration", () => {
  it("ends only the celebration that is shown", async () => {
    // useCelebration is a hook, the store behind it is read through a mocked useSyncExternalStore
    vi.doMock("react", () => ({ useSyncExternalStore: (_subscribe: unknown, get: () => unknown) => get() }));
    const navigation = await load();
    expect(navigation.useCelebration()).toBeNull();
    navigation.celebrateWorkout(30);
    const first = navigation.useCelebration()!;
    expect(first.durationMinutes).toBe(30);

    navigation.celebrateWorkout(45);
    const second = navigation.useCelebration()!;
    expect(second.id).not.toBe(first.id);
    // the animation of the first one ends after the second started
    navigation.endCelebration(first.id);
    expect(navigation.useCelebration()).toBe(second);
    navigation.endCelebration(second.id);
    expect(navigation.useCelebration()).toBeNull();
    vi.doUnmock("react");
  });
});
