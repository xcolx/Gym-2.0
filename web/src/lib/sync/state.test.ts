import { describe, expect, it } from "vitest";

import { initialSyncStatus, syncProblems, type SyncProblem, type SyncStatus } from "./state";

const problem = (id: string, date: Date): SyncProblem => ({ id, title: id, message: `${id} failed`, date });

const status = (changes: Partial<SyncStatus>): SyncStatus => ({ ...initialSyncStatus(), ...changes });

describe("syncProblems", () => {
  it("is empty for a sync without problems", () => {
    expect(syncProblems(initialSyncStatus())).toEqual([]);
  });

  it("lists the rejected creates and blocked workouts, the newest first", () => {
    const problems = syncProblems(
      status({
        rejectedCreates: { a: problem("a", new Date(2026, 9, 1)), c: problem("c", new Date(2026, 9, 3)) },
        blockedWorkouts: { b: problem("b", new Date(2026, 9, 2)) },
      }),
    );
    expect(problems.map((entry) => entry.id)).toEqual(["c", "b", "a"]);
  });

  it("puts a failed sync on top with its message, its date or else now", () => {
    const now = new Date(2026, 9, 20);
    const failed = status({
      state: "failed",
      failureMessage: "You are offline.",
      failureDate: null,
      rejectedCreates: { a: problem("a", new Date(2026, 9, 25)) },
    });
    const [first, second] = syncProblems(failed, now);
    expect(first).toEqual({
      id: "syncFailed",
      title: "Sync failed",
      message: "You are offline.\n\nYour changes are kept on this device and uploaded with the next sync.",
      date: now,
    });
    expect(second.id).toBe("a");

    const date = new Date(2026, 9, 19);
    expect(syncProblems(status({ state: "failed", failureDate: date }), now)[0]).toMatchObject({
      date,
      message: expect.stringMatching(/^Something went wrong\./),
    });
  });

  it("doesn't show a failure once the state isn't failed anymore", () => {
    expect(syncProblems(status({ state: "syncing", failureMessage: "old", failureDate: new Date() }))).toEqual([]);
  });

  it("returns a new list every time, the status isn't changed", () => {
    const value = status({ rejectedCreates: { a: problem("a", new Date()) } });
    const problems = syncProblems(value);
    problems.pop();
    expect(Object.keys(value.rejectedCreates)).toEqual(["a"]);
  });
});
