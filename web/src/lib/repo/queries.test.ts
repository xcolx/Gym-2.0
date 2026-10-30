import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deleteUserDb, openUserDb, type GymDB } from "@/lib/db";
import { registerSyncHandlers } from "@/lib/sync/registry";
import { equipment, makeChat, makeExercise, makeMembers, makeUser, makeWorkout, makeWorkoutExercise, muscleGroups, muscles } from "@/test/fixtures";
import {
  chatsWithMembers,
  compareNames,
  currentUser,
  exercisesById,
  finishedWorkouts,
  referenceData,
  schemesWithExercises,
  workoutsInProgress,
  workoutsThisWeek,
  workoutWithExercises,
} from "./queries";
import { createScheme, deleteScheme, updateScheme } from "./schemes";
import { NotFoundError } from "./write";

let db: GymDB;
let unregister: () => void;

beforeEach(async () => {
  db = (await openUserDb(42))!;
  unregister = registerSyncHandlers({ requestSync: vi.fn(), pushPendingChanges: async () => true });
});

afterEach(async () => {
  unregister();
  await deleteUserDb(42);
});

describe("compareNames", () => {
  it("sorts like SwiftData: localized, ignoring case, numbers by value", () => {
    expect(["Day 10", "day 2", "bench", "Apfel", "Äpfel 2"].sort(compareNames)).toEqual(["Apfel", "Äpfel 2", "bench", "day 2", "Day 10"]);
    expect(compareNames("Squat", "squat")).toBe(0);
  });
});

describe("reference data and users", () => {
  it("maps the reference data by server id", async () => {
    await db.muscles.bulkPut(muscles);
    await db.muscleGroups.bulkPut(muscleGroups);
    await db.equipment.bulkPut(equipment);
    const reference = await referenceData(db);
    expect(reference.muscles.get(4)?.name).toBe("Quads");
    expect(reference.muscleGroups.get(2)?.name).toBe("Legs");
    expect(reference.equipment.size).toBe(3);
  });

  it("finds the current user", async () => {
    expect(await currentUser(db)).toBeNull();
    await db.users.bulkPut([makeUser({ serverId: 9 }), makeUser({ serverId: 42, isCurrentUser: true })]);
    expect((await currentUser(db))?.serverId).toBe(42);
  });
});

describe("workouts", () => {
  const bench = makeExercise({ id: "bench" });

  beforeEach(async () => {
    await db.exercises.put(bench);
  });

  it("lists the finished workouts with their sorted exercises, the newest first", async () => {
    const older = makeWorkout({ id: "older", date: new Date(2026, 9, 1) });
    const newer = makeWorkout({ id: "newer", date: new Date(2026, 9, 10) });
    const running = makeWorkout({ id: "running", inProgress: true, date: new Date(2026, 9, 20) });
    await db.workouts.bulkPut([older, newer, running]);
    await db.workoutExercises.bulkPut([
      makeWorkoutExercise({ id: "second", workoutId: "newer", exerciseId: "bench", index: 1 }),
      makeWorkoutExercise({ id: "first", workoutId: "newer", exerciseId: "bench", index: 0 }),
      makeWorkoutExercise({ id: "deleted", workoutId: "older", exerciseId: "gone", index: 0 }),
      makeWorkoutExercise({ id: "none", workoutId: "older", exerciseId: null, index: 1 }),
    ]);

    const finished = await finishedWorkouts(db);
    expect(finished.map((workout) => workout.id)).toEqual(["newer", "older"]);
    expect(finished[0].workoutExercises.map((we) => we.id)).toEqual(["first", "second"]);
    expect(finished[0].workoutExercises[0].exercise).toEqual(bench);
    // an exercise that doesn't exist (anymore) is null
    expect(finished[1].workoutExercises.map((we) => we.exercise)).toEqual([null, null]);

    expect((await workoutsInProgress(db)).map((workout) => workout.id)).toEqual(["running"]);
  });

  it("finds one workout with its exercises", async () => {
    await db.workouts.put(makeWorkout({ id: "w" }));
    expect(await workoutWithExercises(db, "missing")).toBeNull();
    expect((await workoutWithExercises(db, "w"))?.workoutExercises).toEqual([]);
  });

  it("lists the finished workouts of the current week", async () => {
    // Wednesday
    const now = new Date(2026, 9, 21, 12, 0);
    await db.workouts.bulkPut([
      makeWorkout({ id: "monday", date: new Date(2026, 9, 19, 7, 0) }),
      makeWorkout({ id: "last week", date: new Date(2026, 9, 14, 12, 0) }),
      makeWorkout({ id: "running", inProgress: true, date: new Date(2026, 9, 20) }),
    ]);
    const ids = (await workoutsThisWeek(db, now)).map((workout) => workout.id);
    expect(ids).toContain("monday");
    expect(ids).not.toContain("last week");
    expect(ids).not.toContain("running");
  });

  it("maps the exercises by local id", async () => {
    expect((await exercisesById(db)).get("bench")).toEqual(bench);
  });
});

describe("schemes", () => {
  beforeEach(async () => {
    await db.exercises.bulkPut([makeExercise({ id: "a", name: "A" }), makeExercise({ id: "b", name: "B" })]);
  });

  it("lists the exercises of the schemes in their order", async () => {
    const scheme = await createScheme("Push", ["b", "a"]);
    const other = await createScheme("Empty", []);
    const [withExercises, empty] = await schemesWithExercises(db, [scheme, other]);
    expect(withExercises.exercises.map((exercise) => exercise.id)).toEqual(["b", "a"]);
    expect(empty.exercises).toEqual([]);
    expect(await schemesWithExercises(db, [])).toEqual([]);
  });

  it("rolls the whole change back if an exercise doesn't exist", async () => {
    await expect(createScheme("Broken", ["a", "missing"])).rejects.toThrow("The exercise missing doesn't exist (anymore).");
    expect(await db.workoutSchemes.count()).toBe(0);
    expect(await db.workoutSchemeExercises.count()).toBe(0);

    const scheme = await createScheme("Push", ["a"]);
    await expect(updateScheme(scheme.id, "Renamed", ["missing"])).rejects.toMatchObject({ name: "NotFoundError" });
    expect(await db.workoutSchemes.get(scheme.id)).toMatchObject({ name: "Push" });
    expect((await db.workoutSchemeExercises.toArray()).map((row) => row.exerciseId)).toEqual(["a"]);
  });

  it("throws for a scheme that doesn't exist (anymore)", async () => {
    await expect(updateScheme("missing", "Name", [])).rejects.toThrow("The workout scheme missing doesn't exist (anymore).");
    // Dexie turns an error named "NotFoundError" thrown in a transaction into its own Dexie.NotFoundError, the
    // repo's error is its `inner`
    await expect(deleteScheme("missing")).rejects.toMatchObject({ name: "NotFoundError", inner: expect.any(NotFoundError) });
  });

  // BUG (latent): `NotFoundError` of write.ts is documented as what repo functions throw for a missing row, but
  // every repo function runs in `write()`'s Dexie transaction, and Dexie maps errors by their name: one named
  // "NotFoundError" (a DOMException name) reaches the caller as a Dexie.NotFoundError (a DexieError) that wraps it in
  // `inner`. So `error instanceof NotFoundError` is never true for a caller. No app code checks it today (the error
  // page only shows the message, which is kept). A different `name` (e.g. "RowNotFoundError") would avoid it.
  it.fails("throws the repo's NotFoundError to the caller", async () => {
    await expect(deleteScheme("missing")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("keeps a created scheme created when it is changed before the first push", async () => {
    const scheme = await createScheme("Push", ["a"]);
    await updateScheme(scheme.id, "Push 2", ["a", "b"]);
    expect(await db.workoutSchemes.get(scheme.id)).toMatchObject({ name: "Push 2", syncState: "created" });
  });
});

describe("chatsWithMembers", () => {
  it("lists the chats with their members, the most recently active first", async () => {
    await db.chats.bulkPut([
      makeChat({ serverId: 1, createdAt: new Date(2026, 9, 1) }),
      makeChat({ serverId: 2, createdAt: new Date(2026, 9, 2), latestMessageTimestamp: new Date(2026, 9, 10) }),
      makeChat({ serverId: 3, createdAt: new Date(2026, 9, 5) }),
    ]);
    await db.chatMembers.bulkPut([...makeMembers(1, [42, 9]), ...makeMembers(2, [42])]);
    const chats = await chatsWithMembers(db);
    expect(chats.map((chat) => chat.serverId)).toEqual([2, 3, 1]);
    expect(chats[2].members.map((member) => member.userId).sort((a, b) => a - b)).toEqual([9, 42]);
    expect(chats[1].members).toEqual([]);
  });
});
