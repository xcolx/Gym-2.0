import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { closeUserDb, deleteUserDb, getPendingDeletions, getPendingSchemePerformances, openUserDb, type GymDB } from "@/lib/db";
import { registerSyncHandlers } from "@/lib/sync/registry";
import { equipment, makeExercise } from "@/test/fixtures";
import type { User } from "@/types/models";
import { createExercise, deleteExercise, updateExercise, type ExerciseInput } from "./exercises";
import { finishedWorkouts, hasUnpushedChanges, schemesWithExercises, workoutWithExercises } from "./queries";
import { createScheme, deleteScheme, updateScheme } from "./schemes";
import { storeChat } from "./chats";
import { setBodyweight, setSchemeColor } from "./user";
import {
  addExercisesToWorkout,
  addSet,
  continueWorkout,
  deleteWorkout,
  finishWorkout,
  moveWorkoutExercise,
  newWorkoutExercise,
  removeExerciseFromWorkout,
  removeLastSet,
  saveEditedWorkout,
  setSetValue,
  setUnilateral,
  startWorkout,
  startWorkoutFromScheme,
  workoutHasEnteredValues,
} from "./workouts";

const USER_ID = 42;
let db: GymDB;
const requestSync = vi.fn();

const currentUser: User = {
  serverId: USER_ID,
  syncState: "synced",
  username: "colin",
  profileImageUrl: "",
  profileIconUrl: "",
  language: null,
  email: null,
  createdAt: null,
  bodyweight: 80,
  schemeColor: null,
  weightUnit: null,
  distanceUnit: null,
  isCurrentUser: true,
  isFriend: false,
  isBlocked: false,
};

// Synced exercises: bench press (barbell) and pull ups (bodyweight)
const bench = makeExercise({ id: "bench", serverId: 1, syncState: "synced", equipmentId: 1 });
const pullUps = makeExercise({ id: "pullUps", serverId: 2, syncState: "synced", name: "Pull Ups", equipmentId: 3 });

beforeEach(async () => {
  db = (await openUserDb(USER_ID))!;
  await db.users.put(currentUser);
  await db.equipment.bulkPut(equipment);
  await db.exercises.bulkPut([bench, pullUps]);
  requestSync.mockClear();
  registerSyncHandlers({ requestSync, pushPendingChanges: async () => true });
});

afterEach(async () => {
  await deleteUserDb(USER_ID);
});

describe("database", () => {
  it("opens one database per user and closes the previous one", async () => {
    expect(db.name).toBe("gym2-user-42");
    const other = await openUserDb(7);
    expect(other?.name).toBe("gym2-user-7");
    expect(db.isOpen()).toBe(false);
    closeUserDb();
    await deleteUserDb(7);
    db = (await openUserDb(USER_ID))!;
    // the data of the first user is still there
    expect(await db.users.get(USER_ID)).toBeDefined();
  });
});

describe("workouts", () => {
  it("starts a workout with one empty set per exercise, the bodyweight for bodyweight exercises", async () => {
    const workout = await startWorkout("Pull", ["bench", "pullUps"]);
    const loaded = (await workoutWithExercises(db, workout.id))!;
    expect(loaded).toMatchObject({ name: "Pull", inProgress: true, syncState: "created", duration: 0 });
    expect(loaded.workoutExercises.map((we) => [we.exercise?.name, we.index, we.reps, we.weights])).toEqual([
      ["Bench Press", 0, [0], [0]],
      ["Pull Ups", 1, [0], [80]],
    ]);
    expect(requestSync).toHaveBeenCalled();
  });

  it("changes sets and marks synced rows as updated", async () => {
    const workout = await startWorkout("Push", ["bench"]);
    const [we] = (await workoutWithExercises(db, workout.id))!.workoutExercises;
    await db.workoutExercises.update(we.id, { syncState: "synced", serverId: 9 });

    await addSet(we.id);
    await setSetValue(we.id, "reps", 1, 7.6);
    await setSetValue(we.id, "weights", 1, 62.5);
    await setSetValue(we.id, "time", 0, 30);
    let row = (await db.workoutExercises.get(we.id))!;
    expect(row).toMatchObject({ reps: [0, 8], weights: [0, 62.5], time: null, syncState: "updated" });

    await setUnilateral(we.id, true);
    row = (await db.workoutExercises.get(we.id))!;
    expect(row).toMatchObject({ unilateral: true, reps: [0, 0, 8, 0] });
    await addSet(we.id);
    expect((await db.workoutExercises.get(we.id))!.reps).toHaveLength(6);
    await removeLastSet(we.id);
    await removeLastSet(we.id);
    await removeLastSet(we.id);
    // one set (two entries) always stays
    expect((await db.workoutExercises.get(we.id))!.reps).toEqual([0, 0]);
  });

  it("adds, moves and removes exercises", async () => {
    const workout = await startWorkout("Push", ["bench"]);
    await addExercisesToWorkout(workout.id, ["pullUps", "bench"]);
    let exercises = (await workoutWithExercises(db, workout.id))!.workoutExercises;
    expect(exercises.map((we) => we.exerciseId)).toEqual(["bench", "pullUps", "bench"]);

    await moveWorkoutExercise(workout.id, 0, 2);
    exercises = (await workoutWithExercises(db, workout.id))!.workoutExercises;
    expect(exercises.map((we) => [we.exerciseId, we.index])).toEqual([
      ["pullUps", 0],
      ["bench", 1],
      ["bench", 2],
    ]);

    await db.workoutExercises.update(exercises[0].id, { serverId: 77 });
    await removeExerciseFromWorkout(exercises[0].id);
    exercises = (await workoutWithExercises(db, workout.id))!.workoutExercises;
    expect(exercises.map((we) => we.index)).toEqual([0, 1]);
    expect(await getPendingDeletions(db)).toEqual([{ kind: "workoutExercise", serverId: 77 }]);
  });

  it("finishes a workout without the empty sets and exercises", async () => {
    const workout = await startWorkout("Pull", ["bench", "pullUps"]);
    const [benchRow] = (await workoutWithExercises(db, workout.id))!.workoutExercises;
    await setSetValue(benchRow.id, "reps", 0, 10);

    const result = await finishWorkout(workout.id);
    expect(result).toEqual({ duration: 0, deleted: false });
    const finished = await finishedWorkouts(db);
    expect(finished).toHaveLength(1);
    expect(finished[0].workoutExercises.map((we) => we.exercise?.name)).toEqual(["Bench Press"]);
    expect(finished[0].inProgress).toBe(false);
  });

  it("finishes a workout at the given end", async () => {
    const workout = await startWorkout("Pull", ["bench"]);
    await setSetValue((await workoutWithExercises(db, workout.id))!.workoutExercises[0].id, "reps", 0, 10);
    const end = new Date(workout.date.getTime() + 47.5 * 60_000);
    expect(await finishWorkout(workout.id, end)).toEqual({ duration: 47, deleted: false });
    expect((await db.workouts.get(workout.id))?.duration).toBe(47);
  });

  it("deletes a finished workout without any entry and records only pushed deletions", async () => {
    const empty = await startWorkout("Empty", ["bench"]);
    expect(await finishWorkout(empty.id)).toMatchObject({ deleted: true });
    expect(await db.workouts.count()).toBe(0);

    const pushed = await startWorkout("Pushed", ["bench"]);
    await db.workouts.update(pushed.id, { serverId: 5 });
    await deleteWorkout(pushed.id);
    expect(await db.workoutExercises.count()).toBe(0);
    expect(await getPendingDeletions(db)).toEqual([{ kind: "workout", serverId: 5 }]);
  });

  it("knows whether a value was entered, without one finishing would delete the workout", async () => {
    // the weight of pull ups starts with the bodyweight, which counts as not entered
    const workout = await startWorkout("Pull", ["pullUps"]);
    expect(await workoutHasEnteredValues(workout.id)).toBe(false);
    await setSetValue((await workoutWithExercises(db, workout.id))!.workoutExercises[0].id, "reps", 0, 8);
    expect(await workoutHasEnteredValues(workout.id)).toBe(true);
  });

  it("saves an edited past workout and marks only what changed", async () => {
    const workout = await startWorkout("Push", ["bench", "pullUps"]);
    const rows = (await workoutWithExercises(db, workout.id))!.workoutExercises;
    for (const row of rows) await setSetValue(row.id, "reps", 0, 10);
    await finishWorkout(workout.id);
    // as if pushed
    await db.workouts.update(workout.id, { serverId: 9, syncState: "synced" });
    await db.workoutExercises.update(rows[0].id, { serverId: 90, syncState: "synced" });
    await db.workoutExercises.update(rows[1].id, { serverId: 91, syncState: "synced" });

    // Unchanged: nothing is marked
    await saveEditedWorkout((await workoutWithExercises(db, workout.id))!);
    expect((await db.workouts.get(workout.id))?.syncState).toBe("synced");
    expect((await db.workoutExercises.toArray()).map((we) => we.syncState)).toEqual(["synced", "synced"]);

    // Renamed, the bench press changed, the pull ups removed and the bench press added again
    const draft = (await workoutWithExercises(db, workout.id))!;
    const [benchRow] = draft.workoutExercises;
    await saveEditedWorkout({
      ...draft,
      name: "  Chest  ",
      workoutExercises: [
        { ...benchRow, reps: [12] },
        { ...newWorkoutExercise(workout.id, bench, 1, 0), exercise: bench },
      ],
    });
    const saved = (await workoutWithExercises(db, workout.id))!;
    expect(saved).toMatchObject({ name: "Chest", syncState: "updated" });
    expect(saved.workoutExercises.map((we) => [we.exercise?.name, we.syncState, we.reps])).toEqual([
      ["Bench Press", "updated", [12]],
      ["Bench Press", "created", [0]],
    ]);
    expect(await getPendingDeletions(db)).toEqual([{ kind: "workoutExercise", serverId: 91 }]);
  });

  it("continues a workout only while no other one is in progress", async () => {
    const workout = await startWorkout("A", ["bench"]);
    await setSetValue((await workoutWithExercises(db, workout.id))!.workoutExercises[0].id, "reps", 0, 5);
    await finishWorkout(workout.id);
    await db.workouts.update(workout.id, { duration: 30, syncState: "synced" });

    const other = await startWorkout("B", ["bench"]);
    expect(await continueWorkout(workout.id)).toBe(false);
    await deleteWorkout(other.id);
    expect(await continueWorkout(workout.id)).toBe(true);
    const continued = (await db.workouts.get(workout.id))!;
    expect(continued).toMatchObject({ inProgress: true, syncState: "updated" });
    expect(Date.now() - continued.date.getTime()).toBeGreaterThanOrEqual(30 * 60_000 - 1000);
  });
});

describe("workout schemes", () => {
  it("creates, updates and deletes schemes", async () => {
    const scheme = await createScheme("Pull", ["pullUps", "bench"]);
    let [loaded] = await schemesWithExercises(db, [(await db.workoutSchemes.get(scheme.id))!]);
    expect(loaded.exercises.map((e) => e.id)).toEqual(["pullUps", "bench"]);
    expect(loaded.syncState).toBe("created");

    await db.workoutSchemes.update(scheme.id, { syncState: "synced", serverId: 3 });
    await updateScheme(scheme.id, "Pull 2", ["bench"]);
    [loaded] = await schemesWithExercises(db, [(await db.workoutSchemes.get(scheme.id))!]);
    expect(loaded).toMatchObject({ name: "Pull 2", syncState: "updated" });
    expect(loaded.exercises.map((e) => e.id)).toEqual(["bench"]);

    await deleteScheme(scheme.id);
    expect(await db.workoutSchemeExercises.count()).toBe(0);
    expect(await getPendingDeletions(db)).toEqual([{ kind: "workoutScheme", serverId: 3 }]);
  });

  it("marks the scheme as performed when a workout of it starts", async () => {
    const scheme = await createScheme("Pull", ["pullUps"]);
    await startWorkoutFromScheme(scheme.id, "Pull", ["pullUps"]);
    expect((await db.workoutSchemes.get(scheme.id))!.lastPerformed).toBeInstanceOf(Date);
    expect(await getPendingSchemePerformances(db)).toEqual([scheme.clientUUID]);
  });
});

describe("exercises", () => {
  const input: ExerciseInput = {
    name: "Cable Fly",
    aliases: ["Fly"],
    exerciseDescription: null,
    muscleGroupId: 1,
    equipmentId: 1,
    primaryMuscleIds: [1],
    secondaryMuscleIds: [],
    tracksReps: true,
    tracksWeights: true,
    tracksTime: false,
    tracksIntensity: false,
    tracksDistance: false,
  };

  it("creates a custom exercise and changes its metrics only while it isn't used", async () => {
    const exercise = await createExercise(input);
    expect(exercise).toMatchObject({ verified: false, syncState: "created", serverId: null });

    await updateExercise(exercise.id, { ...input, tracksTime: true });
    expect((await db.exercises.get(exercise.id))!.tracksTime).toBe(true);

    await startWorkout("Chest", [exercise.id]);
    expect(await db.workoutExercises.where("exerciseId").equals(exercise.id).count()).toBe(1);
    await updateExercise(exercise.id, { ...input, name: "Fly", tracksTime: false });
    expect((await db.exercises.get(exercise.id))!).toMatchObject({ name: "Fly", tracksTime: true });
  });

  it("deletes an exercise and removes it from the schemes", async () => {
    await createScheme("Chest", ["bench", "pullUps"]);
    await deleteExercise("bench");
    expect(await db.exercises.get("bench")).toBeUndefined();
    expect((await db.workoutSchemeExercises.toArray()).map((row) => row.exerciseId)).toEqual(["pullUps"]);
    expect(await getPendingDeletions(db)).toEqual([{ kind: "exercise", serverId: 1 }]);
  });
});

describe("unpushed changes", () => {
  it("knows whether the next sync has something to push", async () => {
    expect(await hasUnpushedChanges(db)).toBe(false);
    const scheme = await createScheme("Legs", []);
    expect(await hasUnpushedChanges(db)).toBe(true);
    await db.workoutSchemes.update(scheme.id, { syncState: "synced", serverId: 1 });
    expect(await hasUnpushedChanges(db)).toBe(false);
    await deleteScheme(scheme.id);
    expect(await hasUnpushedChanges(db)).toBe(true);
  });
});

describe("settings and chats", () => {
  it("stores the settings of the current user for the sync", async () => {
    await setBodyweight(81.26);
    await setSchemeColor("#00ff00");
    expect(await db.users.get(USER_ID)).toMatchObject({ bodyweight: 81.3, schemeColor: "#00FF00", syncState: "updated" });

    // nothing changed: not marked again
    await db.users.update(USER_ID, { syncState: "synced" });
    await setBodyweight(81.3);
    expect((await db.users.get(USER_ID))!.syncState).toBe("synced");
  });

  it("stores a chat with its members and new messages", async () => {
    const dto = {
      id: 4,
      groupChat: false,
      name: null,
      imageUrl: null,
      createdAt: "2026-10-01T08:00:00+00:00",
      createdBy: 42,
      public: false,
      latestMessageTimestamp: "2026-10-01T09:00:00+00:00",
      latestMessagePreview: "Hi",
      latestMessageSenderId: 42,
      members: [
        { userId: 42, lastReadMessageId: 1, admin: null },
        { userId: 7, lastReadMessageId: 0, admin: null },
      ],
      messages: [{ id: 1, chatId: 4, senderId: 42, createdAt: "2026-10-01T09:00:00+00:00", content: "Hi", imageUrl: null }],
    };
    await storeChat(dto);
    await storeChat({ ...dto, members: [{ userId: 42, lastReadMessageId: 1, admin: null }] });
    expect(await db.chats.get(4)).toMatchObject({ latestMessagePreview: "Hi", input: "", inputUUID: null });
    expect(await db.chatMembers.toArray()).toEqual([{ chatId: 4, userId: 42, lastReadMessageId: 1, admin: null }]);
    expect(await db.messages.count()).toBe(1);
  });
});
