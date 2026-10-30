// Every change of a workout, also while it is in progress, marks the changed rows (syncState), so the sync pushes
// them and the workout can be continued on another device. The changes of a workout in progress also record its last
// change on this device (lib/workout-last-change.ts).

import { exerciseUsesBodyweight } from "@/lib/domain/exercise";
import { planFinishWorkout } from "@/lib/domain/workout";
import {
  appendEntry,
  convertEntries,
  defaultWeight,
  entryCount,
  removeEntry,
  startSets,
  withValue,
  type SetArrays,
} from "@/lib/domain/workout-exercise";
import { addPendingDeletion, requireDb, type GymDB } from "@/lib/db";
import { newUUID } from "@/lib/uuid";
import { clearWorkoutLastChange, recordWorkoutChange } from "@/lib/workout-last-change";
import type { Equipment, Exercise, LocalId, SetMetric, Workout, WorkoutExercise, WorkoutWithExercises } from "@/types/models";
import { markSchemePerformedIn } from "./schemes";
import { changedState, getOrThrow, NotFoundError, write } from "./write";

// MARK: - Helpers

/** Bodyweight (kg) of the current user and whether an exercise uses it as default weight */
async function bodyweightContext(db: GymDB) {
  const currentUser = await db.users.filter((user) => user.isCurrentUser).first();
  const equipment = new Map<number, Equipment>((await db.equipment.toArray()).map((item) => [item.serverId, item]));
  const bodyweight = currentUser?.bodyweight ?? 0;
  return {
    bodyweight,
    usesBodyweight: (exercise: Exercise | null | undefined) => !!exercise && exerciseUsesBodyweight(exercise, { equipment }),
    weightFor: (exercise: Exercise | null | undefined) =>
      defaultWeight(!!exercise && exerciseUsesBodyweight(exercise, { equipment }), bodyweight),
  };
}

/** A new workout exercise with one empty set, see `defaultWeight` for the weight (`Workout.addExercises`) */
export function newWorkoutExercise(workoutId: LocalId, exercise: Exercise, index: number, weight: number): WorkoutExercise {
  return {
    id: newUUID(),
    serverId: null,
    syncState: "created",
    clientUUID: newUUID(),
    workoutId,
    exerciseId: exercise.id,
    unilateral: false,
    index,
    ...startSets(exercise, false, weight),
  };
}

async function exercisesInOrder(db: GymDB, exerciseIds: readonly LocalId[]): Promise<Exercise[]> {
  const exercises = await db.exercises.bulkGet([...exerciseIds]);
  return exercises.map((exercise, i) => {
    if (!exercise) throw new NotFoundError("exercise", exerciseIds[i]);
    return exercise;
  });
}

const sortedByIndex = (rows: WorkoutExercise[]) => rows.sort((a, b) => a.index - b.index);

function workoutExercisesOf(db: GymDB, workoutId: LocalId): Promise<WorkoutExercise[]> {
  return db.workoutExercises.where("workoutId").equals(workoutId).toArray();
}

/** Records the change as last change of the workout if it is in progress, past workouts have none */
async function noteChangeIn(db: GymDB, workoutId: LocalId): Promise<void> {
  const workout = await db.workouts.get(workoutId);
  if (workout?.inProgress) recordWorkoutChange(workoutId);
}

const workoutTables = (db: GymDB) => [db.workouts, db.workoutExercises, db.exercises, db.equipment, db.users];

// MARK: - Starting

/** The workouts in progress, the newest first. A new workout should only be started while there is none. */
export async function getWorkoutsInProgress(): Promise<Workout[]> {
  const workouts = await requireDb().workouts.filter((workout) => workout.inProgress).toArray();
  return workouts.sort((a, b) => b.date.getTime() - a.date.getTime());
}

/**
 * Starts a workout now with the exercises in this order, each with one empty set (`Workout.create` + insert).
 * The caller checks first that no workout is in progress (`getWorkoutsInProgress()`), and gives a free workout without
 * name the name "Free Workout" (DEFAULT_FREE_WORKOUT_NAME). Returns the new workout.
 */
export async function startWorkout(name: string, exerciseIds: readonly LocalId[]): Promise<Workout> {
  return write(workoutTables, (db) => startWorkoutIn(db, name, exerciseIds));
}

/**
 * Starts a workout from a scheme (SchemeWorkoutView): like `startWorkout` with the possibly changed name and
 * exercises, and sets the last performed date of the scheme. Saving the changes to the scheme is `updateScheme`.
 */
export async function startWorkoutFromScheme(
  schemeId: LocalId,
  name: string,
  exerciseIds: readonly LocalId[],
): Promise<Workout> {
  return write(
    (db) => [...workoutTables(db), db.workoutSchemes, db.pendingSchemePerformances],
    async (db) => {
      const workout = await startWorkoutIn(db, name, exerciseIds);
      await markSchemePerformedIn(db, schemeId);
      return workout;
    },
  );
}

async function startWorkoutIn(db: GymDB, name: string, exerciseIds: readonly LocalId[]): Promise<Workout> {
  const { weightFor } = await bodyweightContext(db);
  const exercises = await exercisesInOrder(db, exerciseIds);
  const workout: Workout = {
    id: newUUID(),
    serverId: null,
    syncState: "created",
    clientUUID: newUUID(),
    name,
    date: new Date(),
    duration: 0,
    inProgress: true,
  };
  await db.workouts.add(workout);
  await db.workoutExercises.bulkAdd(
    exercises.map((exercise, index) => newWorkoutExercise(workout.id, exercise, index, weightFor(exercise))),
  );
  return workout;
}

// MARK: - Finishing, cancelling, continuing

// Only outside of a transaction: awaited inside one, the extra async function loses Dexie's transaction zone
async function planFinish(db: GymDB, workout: Workout, workoutExercises: readonly WorkoutExercise[], end: Date) {
  const exercises = new Map(
    (await db.exercises.bulkGet(workoutExercises.flatMap((we) => we.exerciseId ?? []))).flatMap((exercise) =>
      exercise ? [[exercise.id, exercise] as const] : [],
    ),
  );
  const { bodyweight, usesBodyweight } = await bodyweightContext(db);
  return planFinishWorkout(
    workout,
    workoutExercises,
    (we) => usesBodyweight(we.exerciseId === null ? null : exercises.get(we.exerciseId)),
    bodyweight,
    end,
  );
}

/**
 * Whether a value was entered in any set of the workout (`Workout.hasEnteredValues`). Without one, finishing it would
 * delete it, so the user is asked to discard it instead.
 */
export async function workoutHasEnteredValues(id: LocalId): Promise<boolean> {
  const db = requireDb();
  const workout = await getOrThrow(db.workouts, id, "workout");
  const plan = await planFinish(db, workout, await workoutExercisesOf(db, id), new Date());
  return !plan.deleteWorkout;
}

/**
 * Ends the workout (EndWorkoutView, `Workout.save`): the duration becomes the minutes from the start to `end` (now,
 * or the suggested end the user picked, see `suggestedWorkoutEnd`), the sets in which nothing was entered and the
 * exercises without sets are removed. A workout without any exercise left is deleted instead. Returns the duration in
 * minutes (for the celebration) and whether the workout was deleted.
 */
export async function finishWorkout(id: LocalId, end: Date = new Date()): Promise<{ duration: number; deleted: boolean }> {
  const result = await write(
    (db) => [...workoutTables(db), db.pendingDeletions],
    async (db) => {
      const workout = await getOrThrow(db.workouts, id, "workout");
      const workoutExercises = await workoutExercisesOf(db, id);
      const exercises = new Map(
        (await db.exercises.bulkGet(workoutExercises.flatMap((we) => we.exerciseId ?? []))).flatMap((exercise) =>
          exercise ? [[exercise.id, exercise] as const] : [],
        ),
      );
      const { bodyweight, usesBodyweight } = await bodyweightContext(db);
      const plan = planFinishWorkout(
        workout,
        workoutExercises,
        (we) => usesBodyweight(we.exerciseId === null ? null : exercises.get(we.exerciseId)),
        bodyweight,
        end,
      );

      for (const deletedId of plan.deletedIds) {
        await deleteWorkoutExerciseIn(db, deletedId);
      }
      if (plan.deleteWorkout) {
        await deleteWorkoutIn(db, workout);
        return { duration: plan.duration, deleted: true };
      }
      const byId = new Map(workoutExercises.map((we) => [we.id, we]));
      await db.workoutExercises.bulkPut(
        plan.kept.map((kept) => {
          const old = byId.get(kept.id)!;
          return { ...old, ...kept, syncState: changedState(old.syncState) };
        }),
      );
      await db.workouts.put({
        ...workout,
        duration: plan.duration,
        inProgress: false,
        syncState: changedState(workout.syncState),
      });
      return { duration: plan.duration, deleted: false };
    },
  );
  clearWorkoutLastChange(id);
  return result;
}

/**
 * Deletes the workout with its exercises, also on the server with the next sync (`deleteSynced(_ workout:)`). Used to
 * cancel a workout in progress (WhilstWorkoutView) and to delete a past workout (PastWorkoutDetailView).
 */
export async function deleteWorkout(id: LocalId): Promise<void> {
  await write(
    (db) => [db.workouts, db.workoutExercises, db.pendingDeletions],
    async (db) => deleteWorkoutIn(db, await getOrThrow(db.workouts, id, "workout")),
  );
  clearWorkoutLastChange(id);
}

async function deleteWorkoutIn(db: GymDB, workout: Workout): Promise<void> {
  // The server deletes the exercises of the workout with it, so only the workout is recorded
  await addPendingDeletion(db, "workout", workout.serverId);
  await db.workoutExercises.where("workoutId").equals(workout.id).delete();
  await db.workouts.delete(workout.id);
}

/**
 * Continues a finished workout (PastWorkoutDetailViewModel): it is in progress again and its start is moved, so that
 * the time already trained counts. Returns false (and changes nothing) if another workout is in progress.
 */
export async function continueWorkout(id: LocalId): Promise<boolean> {
  // e.g. left from a time it was in progress before and ended on another device
  clearWorkoutLastChange(id);
  return write(
    (db) => [db.workouts],
    async (db) => {
      const inProgress = await db.workouts.filter((workout) => workout.inProgress).count();
      if (inProgress > 0) return false;
      const workout = await getOrThrow(db.workouts, id, "workout");
      await db.workouts.put({
        ...workout,
        inProgress: true,
        date: new Date(Date.now() - workout.duration * 60_000),
        syncState: changedState(workout.syncState),
      });
      return true;
    },
  );
}

// MARK: - Changing the workout

/**
 * Renames the workout while it is in progress (EditPerformingWorkoutView): an empty name keeps the last one, since
 * the server needs at least one character. The caller limits the input to MAX_WORKOUT_NAME_LENGTH.
 */
export async function renameWorkout(id: LocalId, name: string): Promise<void> {
  const trimmed = name.trim();
  if (trimmed === "") return;
  await write(
    (db) => [db.workouts],
    async (db) => {
      const workout = await getOrThrow(db.workouts, id, "workout");
      if (workout.name === trimmed) return;
      await db.workouts.put({ ...workout, name: trimmed, syncState: changedState(workout.syncState) });
      await noteChangeIn(db, id);
    },
  );
}

/**
 * Stores the draft of an edited past workout (EditPastWorkoutView "Save"): the name, start and duration, the sets and
 * positions of its exercises, the added exercises, and the removed ones are deleted (also on the server with the next
 * sync). Only what differs from the stored rows is marked for the sync. The name is trimmed, the caller makes sure it
 * isn't empty.
 */
export async function saveEditedWorkout(draft: WorkoutWithExercises): Promise<void> {
  await write(
    (db) => [db.workouts, db.workoutExercises, db.pendingDeletions],
    async (db) => {
      const workout = await getOrThrow(db.workouts, draft.id, "workout");
      const name = draft.name.trim();
      if (name !== workout.name || draft.date.getTime() !== workout.date.getTime() || draft.duration !== workout.duration) {
        await db.workouts.put({
          ...workout,
          name,
          date: draft.date,
          duration: draft.duration,
          syncState: changedState(workout.syncState),
        });
      }

      const stored = new Map((await workoutExercisesOf(db, draft.id)).map((we) => [we.id, we]));
      const changed: WorkoutExercise[] = [];
      const added: WorkoutExercise[] = [];
      for (const { exercise: _exercise, ...row } of draft.workoutExercises) {
        const old = stored.get(row.id);
        if (!old) {
          added.push({ ...row, workoutId: draft.id });
          continue;
        }
        stored.delete(row.id);
        if (setsOrPositionChanged(old, row)) {
          const { unilateral, index, reps, weights, time, intensity, distance } = row;
          changed.push({ ...old, unilateral, index, reps, weights, time, intensity, distance, syncState: changedState(old.syncState) });
        }
      }
      for (const removed of stored.values()) {
        await deleteWorkoutExerciseIn(db, removed.id);
      }
      await db.workoutExercises.bulkPut(changed);
      await db.workoutExercises.bulkAdd(added);
    },
  );
}

function setsOrPositionChanged(a: WorkoutExercise, b: WorkoutExercise): boolean {
  const same = (x: number[] | null, y: number[] | null) =>
    x === y || (x !== null && y !== null && x.length === y.length && x.every((value, i) => value === y[i]));
  return (
    a.unilateral !== b.unilateral ||
    a.index !== b.index ||
    !same(a.reps, b.reps) ||
    !same(a.weights, b.weights) ||
    !same(a.time, b.time) ||
    !same(a.intensity, b.intensity) ||
    !same(a.distance, b.distance)
  );
}

/** Appends the exercises after the existing ones, each with one empty set (`Workout.addExercises`) */
export async function addExercisesToWorkout(workoutId: LocalId, exerciseIds: readonly LocalId[]): Promise<void> {
  if (exerciseIds.length === 0) return;
  await write(workoutTables, async (db) => {
    await getOrThrow(db.workouts, workoutId, "workout");
    const { weightFor } = await bodyweightContext(db);
    const exercises = await exercisesInOrder(db, exerciseIds);
    // Like Swift: after the number of exercises, which equals the highest index + 1 while they are consecutive
    const start = await db.workoutExercises.where("workoutId").equals(workoutId).count();
    await db.workoutExercises.bulkAdd(
      exercises.map((exercise, i) => newWorkoutExercise(workoutId, exercise, start + i, weightFor(exercise))),
    );
    await noteChangeIn(db, workoutId);
  });
}

/**
 * Removes an exercise from its workout, also on the server with the next sync (EditPerformingWorkoutView.deleteItems).
 * The following exercises move up locally without being marked: the server shifts them itself.
 */
export async function removeExerciseFromWorkout(workoutExerciseId: LocalId): Promise<void> {
  await write(
    (db) => [db.workouts, db.workoutExercises, db.pendingDeletions],
    async (db) => {
      const workoutExercise = await getOrThrow(db.workoutExercises, workoutExerciseId, "workout exercise");
      await deleteWorkoutExerciseIn(db, workoutExerciseId);
      const remaining = sortedByIndex(await workoutExercisesOf(db, workoutExercise.workoutId));
      await db.workoutExercises.bulkPut(remaining.map((we, index) => ({ ...we, index })));
      await noteChangeIn(db, workoutExercise.workoutId);
    },
  );
}

async function deleteWorkoutExerciseIn(db: GymDB, workoutExerciseId: LocalId): Promise<void> {
  const workoutExercise = await db.workoutExercises.get(workoutExerciseId);
  if (!workoutExercise) return;
  await addPendingDeletion(db, "workoutExercise", workoutExercise.serverId);
  await db.workoutExercises.delete(workoutExerciseId);
}

/**
 * Puts the exercises of the workout into this order (all ids of the workout, e.g. after a drag and drop). The ones
 * whose index changed are marked (EditPerformingWorkoutView.move).
 */
export async function reorderWorkoutExercises(workoutId: LocalId, orderedIds: readonly LocalId[]): Promise<void> {
  await write(
    (db) => [db.workouts, db.workoutExercises],
    async (db) => {
      const workoutExercises = await workoutExercisesOf(db, workoutId);
      const position = new Map(orderedIds.map((id, index) => [id, index]));
      // Ids that weren't passed keep their order after the passed ones
      const ordered = sortedByIndex(workoutExercises).sort(
        (a, b) => (position.get(a.id) ?? Infinity) - (position.get(b.id) ?? Infinity),
      );
      const changed = ordered
        .map((we, index) => ({ we, index }))
        .filter(({ we, index }) => we.index !== index)
        .map(({ we, index }) => ({ ...we, index, syncState: changedState(we.syncState) }));
      await db.workoutExercises.bulkPut(changed);
      if (changed.length > 0) await noteChangeIn(db, workoutId);
    },
  );
}

/** Moves the exercise at `from` to the position `to` (both indexes in the sorted list) */
export async function moveWorkoutExercise(workoutId: LocalId, from: number, to: number): Promise<void> {
  const db = requireDb();
  const ids = sortedByIndex(await workoutExercisesOf(db, workoutId)).map((we) => we.id);
  if (from < 0 || from >= ids.length) return;
  const [moved] = ids.splice(from, 1);
  ids.splice(Math.max(0, Math.min(to, ids.length)), 0, moved);
  await reorderWorkoutExercises(workoutId, ids);
}

// MARK: - Sets

async function changeSets(
  workoutExerciseId: LocalId,
  change: (workoutExercise: WorkoutExercise, weight: number) => SetArrays | Partial<WorkoutExercise> | null,
): Promise<void> {
  await write(
    (db) => [db.workouts, db.workoutExercises, db.exercises, db.equipment, db.users],
    async (db) => {
      const workoutExercise = await getOrThrow(db.workoutExercises, workoutExerciseId, "workout exercise");
      const exercise = workoutExercise.exerciseId === null ? null : await db.exercises.get(workoutExercise.exerciseId);
      const { weightFor } = await bodyweightContext(db);
      const changes = change(workoutExercise, weightFor(exercise));
      if (!changes) return;
      await db.workoutExercises.put({
        ...workoutExercise,
        ...changes,
        syncState: changedState(workoutExercise.syncState),
      });
      await noteChangeIn(db, workoutExercise.workoutId);
    },
  );
}

/** Adds a set: one entry, two for a unilateral exercise (EditWorkoutExerciseView "add set") */
export function addSet(workoutExerciseId: LocalId): Promise<void> {
  return changeSets(workoutExerciseId, (we, weight) => {
    const once = appendEntry(we, weight);
    return we.unilateral ? appendEntry(once, weight) : once;
  });
}

/** Removes the last set, but always keeps one (EditWorkoutExerciseView "remove set") */
export function removeLastSet(workoutExerciseId: LocalId): Promise<void> {
  return changeSets(workoutExerciseId, (we) => {
    const count = entryCount(we);
    if (we.unilateral) {
      if (count <= 2) return null;
      return removeEntry(removeEntry(we, count - 1), count - 2);
    }
    if (count <= 1) return null;
    return removeEntry(we, count - 1);
  });
}

/**
 * Sets one value of an entry in the stored unit (kg, m, s), reps and time are rounded. Does nothing if the exercise
 * doesn't track the metric (NumberInsertView, `setValue`).
 */
export function setSetValue(workoutExerciseId: LocalId, metric: SetMetric, entryIndex: number, value: number): Promise<void> {
  return changeSets(workoutExerciseId, (we) => {
    if (!we[metric] || entryIndex < 0 || entryIndex >= entryCount(we)) return null;
    return withValue(we, metric, entryIndex, value);
  });
}

/**
 * Switches between unilateral and not, converting the entries: every entry gets a left side (0), or only the right
 * sides are kept (`setUnilateral`). Only called by the switch, never by the sync.
 */
export function setUnilateral(workoutExerciseId: LocalId, unilateral: boolean): Promise<void> {
  return changeSets(workoutExerciseId, (we) => {
    if (we.unilateral === unilateral) return null;
    return { ...convertEntries(we, unilateral), unilateral };
  });
}

// MARK: - Import

/** A workout of an imported file, already checked against the limits of the server */
interface ImportedWorkout {
  /** At most 25 characters */
  name: string;
  date: Date;
  /** In minutes, 0 to 1440 */
  duration: number;
  exercises: {
    exerciseId: LocalId;
    unilateral: boolean;
    /** The arrays of the metrics the exercise tracks, null for the others */
    sets: SetArrays;
  }[];
}

/** Inserts finished workouts, e.g. from an imported file (ImportWorkoutsViewModel.confirmImport) */
export async function importWorkouts(workouts: readonly ImportedWorkout[]): Promise<Workout[]> {
  if (workouts.length === 0) return [];
  return write(
    (db) => [db.workouts, db.workoutExercises],
    async (db) => {
      const created: Workout[] = [];
      for (const imported of workouts) {
        const workout: Workout = {
          id: newUUID(),
          serverId: null,
          syncState: "created",
          clientUUID: newUUID(),
          name: imported.name,
          date: imported.date,
          duration: imported.duration,
          inProgress: false,
        };
        await db.workouts.add(workout);
        await db.workoutExercises.bulkAdd(
          imported.exercises.map(
            (exercise, index): WorkoutExercise => ({
              id: newUUID(),
              serverId: null,
              syncState: "created",
              clientUUID: newUUID(),
              workoutId: workout.id,
              exerciseId: exercise.exerciseId,
              unilateral: exercise.unilateral,
              index,
              ...exercise.sets,
            }),
          ),
        );
        created.push(workout);
      }
      return created;
    },
  );
}
