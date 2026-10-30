import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { deleteUserDb, openUserDb, type GymDB } from "@/lib/db";
import { exportWorkouts, readWorkoutFile } from "@/lib/domain/workout-file";
import { makeExercise } from "@/test/fixtures";
import { finishedWorkouts } from "./queries";
import { exerciseHistory, planImportOfWorkoutFile } from "./stats-feature";
import { finishWorkout, importWorkouts, setSetValue, startWorkout } from "./workouts";

const USER_ID = 43;
let db: GymDB;

const bench = makeExercise({ id: "bench", serverId: 1, syncState: "synced", name: "Bench Press", verified: true });
const squat = makeExercise({ id: "squat", serverId: 2, syncState: "synced", name: "Squat", verified: true });

beforeEach(async () => {
  db = (await openUserDb(USER_ID))!;
  await db.exercises.bulkPut([bench, squat]);
});

afterEach(async () => {
  await deleteUserDb(USER_ID);
});

async function finishedWorkout(name: string, date: Date, reps: number) {
  const workout = await startWorkout(name, ["bench", "squat"]);
  const [benchRow, squatRow] = await db.workoutExercises.where("workoutId").equals(workout.id).sortBy("index");
  await setSetValue(benchRow.id, "reps", 0, reps);
  await setSetValue(benchRow.id, "weights", 0, 60);
  await setSetValue(squatRow.id, "reps", 0, 5);
  await finishWorkout(workout.id);
  await db.workouts.update(workout.id, { date, duration: 45 });
  return workout.id;
}

describe("exerciseHistory", () => {
  it("lists the exercise in finished workouts, the newest first", async () => {
    const older = await finishedWorkout("Older", new Date(2026, 8, 1, 18), 8);
    const newer = await finishedWorkout("Newer", new Date(2026, 9, 1, 18), 10);
    // in progress, not part of the history
    await startWorkout("Running", ["bench"]);

    const history = await exerciseHistory(db, "bench");
    expect(history.map((entry) => [entry.workout.id, entry.workout.name, entry.reps])).toEqual([
      [newer, "Newer", [10]],
      [older, "Older", [8]],
    ]);
    expect(await exerciseHistory(db, "unknown")).toEqual([]);
  });
});

describe("export and import", () => {
  it("round-trips the finished workouts through both formats into another account", async () => {
    await finishedWorkout("Push", new Date(2026, 8, 1, 18, 0, 12), 8);
    await finishedWorkout("Pull", new Date(2026, 9, 1, 7, 30), 10);
    const exported = await finishedWorkouts(db);

    const files = (["json", "csv"] as const).map((format) =>
      readWorkoutFile(`export.${format}`, new TextEncoder().encode(exportWorkouts(exported, format))),
    );
    // The same account: every workout exists already
    for (const file of files) {
      expect(await planImportOfWorkoutFile(file)).toMatchObject({ workouts: [], existingCount: 2 });
    }

    const summary = (workouts: typeof exported) =>
      workouts.map((workout) => ({
        name: workout.name,
        date: Math.floor(workout.date.getTime() / 1000),
        duration: workout.duration,
        inProgress: workout.inProgress,
        exercises: workout.workoutExercises.map((we) => [we.exercise?.name, we.index, we.reps, we.weights, we.time]),
      }));

    // Another account with the same exercises
    for (const [index, file] of files.entries()) {
      const otherUser = USER_ID + 1 + index;
      db = (await openUserDb(otherUser))!;
      await db.exercises.bulkPut([bench, squat]);
      const plan = await planImportOfWorkoutFile(file);
      expect(plan).toMatchObject({ existingCount: 0, missingExerciseNames: [], invalidWorkouts: [] });
      await importWorkouts(plan.workouts);

      const imported = await finishedWorkouts(db);
      expect(summary(imported)).toEqual(summary(exported));
      expect(imported.every((workout) => workout.syncState === "created")).toBe(true);
      // New UUIDs: the server would return deleted workouts for the old ones
      expect(imported.map((workout) => workout.clientUUID)).not.toContain(exported[0].clientUUID);
      // Importing the file a second time finds the imported workouts by name and start
      expect(await planImportOfWorkoutFile(file)).toMatchObject({ workouts: [], existingCount: 2 });
      await deleteUserDb(otherUser);
    }
    db = (await openUserDb(USER_ID))!;
  });
});
