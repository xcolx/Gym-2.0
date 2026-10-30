import { errorMessage, isApiError } from "@/lib/api";
import { removeSyncTime, type SyncTimeType } from "@/lib/db";
import type { Exercise, LocalId, Workout, WorkoutScheme } from "@/types/models";
import type { SyncContext } from "./context";
import { logSync } from "./log";
import type { SyncProblem } from "./state";

/** The rows whose changes can be rejected, with what `didReject` needs */
export type RejectedRow =
  | { type: "exercise"; row: Exercise }
  | { type: "workoutScheme"; row: WorkoutScheme }
  | { type: "workout"; row: Workout };

const REJECTION_INFO: Record<RejectedRow["type"], { kind: string; notFound: string; syncTime: SyncTimeType }> = {
  exercise: { kind: "exercise", notFound: "ExerciseNotFoundError", syncTime: "exercises" },
  workoutScheme: { kind: "workout scheme", notFound: "WorkoutSchemeNotFoundError", syncTime: "workoutSchemes" },
  workout: { kind: "workout", notFound: "WorkoutNotFoundError", syncTime: "workouts" },
};

/**
 * The server rejected a change. A create stays local, an update is replaced by the server's version with the next
 * (full) pull, and an object that doesn't exist on the server anymore is removed. `notFound` is the backend's error
 * for the object itself, a 404 can also be about an object it references.
 */
export async function didReject(ctx: SyncContext, target: RejectedRow, error: unknown): Promise<void> {
  const { kind, notFound, syncTime } = REJECTION_INFO[target.type];
  const { row } = target;
  const message = errorMessage(error);
  logSync.error(`The server rejected the ${kind} ${row.name}: ${message}`);

  if (row.serverId === null) {
    const key = row.clientUUID.toLowerCase();
    const existing = ctx.status().rejectedCreates[key];
    // A rejected create is sent again with every sync, it's only reported once
    if (!existing) ctx.report(`The ${kind} “${row.name}” could not be saved: ${message}`);
    const problem: SyncProblem = {
      id: key,
      title: `The ${kind} “${row.name}” is not saved`,
      message: `${message}\n\nIt only exists on this device and is sent again with every sync. Change or delete it to fix this.`,
      date: existing?.date ?? new Date(),
    };
    ctx.setStatus((status) => ({ ...status, rejectedCreates: { ...status.rejectedCreates, [key]: problem } }));
  } else if (isApiError(error) && error.kind === "server" && error.status === 404 && error.code === notFound) {
    ctx.report(`The ${kind} “${row.name}” doesn't exist anymore, your changes to it were discarded.`);
    await ctx.transaction(() => deleteLocally(ctx, target.type, row.id));
  } else {
    ctx.report(`Your changes to the ${kind} “${row.name}” were undone, because they could not be saved: ${message}`);
    await ctx.transaction(async () => {
      await markSynced(ctx, target.type, row.id);
      await removeSyncTime(ctx.db, syncTime);
    });
  }
}

async function markSynced(ctx: SyncContext, type: RejectedRow["type"], id: LocalId): Promise<void> {
  const { db } = ctx;
  switch (type) {
    case "exercise": {
      const current = await db.exercises.get(id);
      if (current) await db.exercises.put({ ...current, syncState: "synced" });
      return;
    }
    case "workoutScheme": {
      const current = await db.workoutSchemes.get(id);
      if (current) await db.workoutSchemes.put({ ...current, syncState: "synced" });
      return;
    }
    case "workout": {
      const current = await db.workouts.get(id);
      if (!current) return;
      await db.workouts.put({ ...current, syncState: "synced" });
      // Restored by the full pull together with the workout
      const rows = await db.workoutExercises.where("workoutId").equals(id).toArray();
      await db.workoutExercises.bulkPut(rows.map((row) => ({ ...row, syncState: "synced" as const })));
      return;
    }
  }
}

/** Removes a row the server doesn't have anymore, with what SwiftData deletes or nullifies with it (inside a transaction) */
export async function deleteLocally(ctx: SyncContext, type: RejectedRow["type"], id: LocalId): Promise<void> {
  const { db } = ctx;
  switch (type) {
    case "exercise": {
      // Nullified in the workouts, removed from the schemes (like `deleteExercise` of lib/repo)
      const rows = await db.workoutExercises.where("exerciseId").equals(id).toArray();
      await db.workoutExercises.bulkPut(rows.map((row) => ({ ...row, exerciseId: null })));
      // Unpushed rows of it are removed by the next push, which lets their workouts be pushed: push once more
      if (rows.some((row) => row.serverId === null || row.syncState !== "synced")) ctx.syncAgain();
      await db.workoutSchemeExercises.where("exerciseId").equals(id).delete();
      await db.exercises.delete(id);
      return;
    }
    case "workoutScheme":
      await db.workoutSchemeExercises.where("schemeId").equals(id).delete();
      await db.workoutSchemes.delete(id);
      return;
    case "workout":
      await db.workoutExercises.where("workoutId").equals(id).delete();
      await db.workouts.delete(id);
      return;
  }
}
