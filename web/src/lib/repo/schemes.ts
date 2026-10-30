import { addPendingDeletion, addPendingSchemePerformance, type GymDB } from "@/lib/db";
import { newUUID } from "@/lib/uuid";
import type { LocalId, WorkoutScheme, WorkoutSchemeExercise } from "@/types/models";
import { changedState, getOrThrow, NotFoundError, write } from "./write";

const schemeTables = (db: GymDB) => [db.workoutSchemes, db.workoutSchemeExercises, db.exercises];

/** Replaces the complete exercise list, like the server does on an update (`replaceExercises(with:context:)`) */
async function replaceExercisesIn(db: GymDB, scheme: WorkoutScheme, exerciseIds: readonly LocalId[]): Promise<void> {
  const existing = await db.exercises.bulkGet([...exerciseIds]);
  existing.forEach((exercise, i) => {
    if (!exercise) throw new NotFoundError("exercise", exerciseIds[i]);
  });
  await db.workoutSchemeExercises.where("schemeId").equals(scheme.id).delete();
  await db.workoutSchemeExercises.bulkAdd(
    exerciseIds.map((exerciseId, index): WorkoutSchemeExercise => ({ id: newUUID(), schemeId: scheme.id, exerciseId, index })),
  );
}

/** Creates a scheme with the exercises in this order (AddSchemeWorkoutView). Returns the new scheme. */
export async function createScheme(name: string, exerciseIds: readonly LocalId[]): Promise<WorkoutScheme> {
  const scheme: WorkoutScheme = {
    id: newUUID(),
    serverId: null,
    syncState: "created",
    clientUUID: newUUID(),
    name,
    lastPerformed: null,
  };
  await write(schemeTables, async (db) => {
    await db.workoutSchemes.add(scheme);
    await replaceExercisesIn(db, scheme, exerciseIds);
  });
  return scheme;
}

/**
 * Saves the name and the complete exercise list of a scheme (EditSchemeWorkoutView, and "Save for future" in
 * SchemeWorkoutView).
 */
export async function updateScheme(id: LocalId, name: string, exerciseIds: readonly LocalId[]): Promise<void> {
  await write(schemeTables, async (db) => {
    const scheme = await getOrThrow(db.workoutSchemes, id, "workout scheme");
    const updated = { ...scheme, name, syncState: changedState(scheme.syncState) };
    await db.workoutSchemes.put(updated);
    await replaceExercisesIn(db, updated, exerciseIds);
  });
}

/** Deletes the scheme with its exercise list, also on the server with the next sync (`deleteSynced(_ scheme:)`) */
export async function deleteScheme(id: LocalId): Promise<void> {
  await write(
    (db) => [db.workoutSchemes, db.workoutSchemeExercises, db.pendingDeletions],
    async (db) => {
      const scheme = await getOrThrow(db.workoutSchemes, id, "workout scheme");
      await addPendingDeletion(db, "workoutScheme", scheme.serverId);
      await db.workoutSchemeExercises.where("schemeId").equals(id).delete();
      await db.workoutSchemes.delete(id);
    },
  );
}

/**
 * Called inside a transaction over workoutSchemes and pendingSchemePerformances when a workout of the scheme is started
 * (`markPerformed()`, see `startWorkoutFromScheme`): the last performed date is now locally, and the next sync sets it
 * on the server, which uses the time of that request.
 */
export async function markSchemePerformedIn(db: GymDB, id: LocalId): Promise<void> {
  const scheme = await getOrThrow(db.workoutSchemes, id, "workout scheme");
  await db.workoutSchemes.put({ ...scheme, lastPerformed: new Date() });
  await addPendingSchemePerformance(db, scheme.clientUUID);
}
