import { errorMessage, errorStatus, isRejection } from "@/lib/api";
import {
  PENDING_DELETION_DISPLAY_NAMES,
  getPendingDeletions,
  removePendingDeletion,
  removeSyncTime,
  type PendingDeletion,
  type PendingDeletionKind,
  type SyncTimeType,
} from "@/lib/db";
import type { SyncContext } from "./context";
import { logSync } from "./log";

const SYNC_TIME_OF_DELETION: Record<PendingDeletionKind, SyncTimeType> = {
  exercise: "exercises",
  workout: "workouts",
  workoutExercise: "workouts",
  workoutScheme: "workoutSchemes",
};

/** Deletes the pending deletions of the kinds on the server, in the order of `kinds` */
export async function pushDeletions(ctx: SyncContext, kinds: PendingDeletionKind[]): Promise<void> {
  const pending = await getPendingDeletions(ctx.db);
  for (const kind of kinds) {
    for (const deletion of pending.filter((entry) => entry.kind === kind)) {
      ctx.ensureRunning();
      try {
        await deleteOnServer(ctx, deletion);
      } catch (error) {
        if (!isRejection(error)) throw error;
        // 404: it's already gone. Otherwise the server keeps it (e.g. an exercise that is part of a workout)
        // and the full pull brings it back.
        if (errorStatus(error) !== 404) {
          logSync.error(
            `The server rejected the deletion of ${deletion.kind} ${deletion.serverId}: ${errorMessage(error)}`,
          );
          await removeSyncTime(ctx.db, SYNC_TIME_OF_DELETION[deletion.kind]);
          ctx.report(
            `A deleted ${PENDING_DELETION_DISPLAY_NAMES[deletion.kind]} was restored, because it could not be deleted: ${errorMessage(error)}`,
          );
        }
      }
      await removePendingDeletion(ctx.db, deletion);
    }
  }
}

function deleteOnServer(ctx: SyncContext, deletion: PendingDeletion): Promise<void> {
  switch (deletion.kind) {
    case "exercise":
      return ctx.api.exercises.delete(deletion.serverId);
    case "workout":
      return ctx.api.workouts.delete(deletion.serverId);
    case "workoutExercise":
      return ctx.api.workouts.deleteExercise(deletion.serverId);
    case "workoutScheme":
      return ctx.api.schemes.delete(deletion.serverId);
  }
}
