// A workout that is already on the server is pushed with one request (PATCH /workouts/{id} with `exerciseChanges`),
// which the server applies atomically. Deleted workout exercises are pushed before it (deletions.ts).

import {
  applyWorkoutDTO,
  findMatching,
  isRejection,
  newWorkoutRequest,
  workoutExerciseDraft,
  workoutExerciseUpdateRequest,
  workoutOfChange,
  workoutUpdateRequest,
  type WorkoutDTO,
  type WorkoutDeltaDTO,
  type WorkoutExerciseChange,
  type WorkoutExerciseDraft,
  type WorkoutExerciseUpdate,
} from "@/lib/api";
import { addPendingDeletion, getSyncTime, removeSyncTime, setSyncTime } from "@/lib/db";
import { exercisesById } from "@/lib/repo/queries";
import type { Exercise, LocalId, Workout, WorkoutExercise } from "@/types/models";
import { exercisesByServerId, isExerciseNotFound, loadDelta, sameJSON, type SyncContext } from "./context";
import { logSync } from "./log";
import { deleteLocally, didReject } from "./rejections";
import type { SyncProblem } from "./state";

/** A change of `exerciseChanges` with what is needed to check the row after the response */
type SentExerciseChange =
  | { op: "create"; rowId: LocalId; index: number; draft: WorkoutExerciseDraft }
  | { op: "update"; rowId: LocalId; index: number; id: number; update: WorkoutExerciseUpdate };

export class WorkoutSync {
  constructor(private readonly ctx: SyncContext) {}

  private get db() {
    return this.ctx.db;
  }

  private get api() {
    return this.ctx.api;
  }

  // MARK: - Push

  async push(): Promise<void> {
    const changedExercises = await this.db.workoutExercises.where("syncState").notEqual("synced").toArray();
    const ids = new Set([
      ...(await this.db.workouts.where("syncState").notEqual("synced").primaryKeys()),
      ...changedExercises.map((row) => row.workoutId),
    ]);
    const pending = (await this.db.workouts.bulkGet([...ids])).filter((workout): workout is Workout => !!workout);
    const blocked = new Map<string, SyncProblem>();
    for (const snapshot of pending) {
      this.ctx.ensureRunning();
      await this.removeOrphanedWorkoutExercises(snapshot.id);
      const workout = await this.db.workouts.get(snapshot.id);
      if (!workout) continue;
      try {
        if (workout.serverId === null) await this.create(workout, blocked);
        else await this.update(workout, workout.serverId, blocked);
      } catch (error) {
        if (!isRejection(error)) throw error;
        // The exercise was deleted on another device: the pull of this sync removes it and nullifies the rows
        if (isExerciseNotFound(error)) await removeSyncTime(this.db, "exercises");
        const current = await this.db.workouts.get(workout.id);
        if (!current) continue;
        await didReject(this.ctx, { type: "workout", row: current }, error);
      }
    }
    this.ctx.setStatus((status) => ({ ...status, blockedWorkouts: Object.fromEntries(blocked) }));
  }

  /**
   * Removes the workout exercises whose exercise is gone (deleted on another device, `exerciseId` nullified by the
   * pull): they can never be pushed and would keep the workout from being pushed. One that was never pushed is removed
   * with its sets (reported), the changes of one the server has are undone and the full pull restores it.
   */
  private async removeOrphanedWorkoutExercises(workoutId: LocalId): Promise<void> {
    const isOrphan = (row: WorkoutExercise, exercises: Map<LocalId, Exercise>) =>
      row.exerciseId === null || !exercises.has(row.exerciseId);
    const rows = await this.db.workoutExercises.where("workoutId").equals(workoutId).toArray();
    if (rows.length === 0) return;
    const exercises = await exercisesById(this.db);
    if (!rows.some((row) => isOrphan(row, exercises))) return;
    const result = await this.ctx.transaction(async () => {
      const workout = await this.db.workouts.get(workoutId);
      if (!workout) return null;
      const currentExercises = await exercisesById(this.db);
      const current = await this.db.workoutExercises.where("workoutId").equals(workoutId).toArray();
      let removed = 0;
      let restored = false;
      for (const row of current.filter((entry) => isOrphan(entry, currentExercises))) {
        if (row.serverId === null) {
          await this.db.workoutExercises.delete(row.id);
          removed += 1;
        } else if (row.syncState !== "synced") {
          await this.db.workoutExercises.put({ ...row, syncState: "synced" });
          restored = true;
        }
      }
      if (removed > 0) {
        // The following ones move up, like `removeExerciseFromWorkout` (the index sent is the position anyway)
        const remaining = (await this.db.workoutExercises.where("workoutId").equals(workoutId).toArray()).sort(
          (a, b) => a.index - b.index,
        );
        await this.db.workoutExercises.bulkPut(remaining.map((row, index) => ({ ...row, index })));
      }
      if (restored) await removeSyncTime(this.db, "workouts");
      return { name: workout.name, removed, restored };
    });
    if (!result) return;
    if (result.removed > 0) {
      logSync.error(`Removed ${result.removed} exercises without an exercise from the workout ${result.name}`);
      this.ctx.report(
        `An exercise of the workout “${result.name}” was deleted on another device. Its sets were removed from the workout, they can't be saved without it.`,
      );
    }
    if (result.restored) {
      this.ctx.report(`Your changes to an exercise of the workout “${result.name}” were undone, because the exercise was deleted on another device.`);
    }
  }

  /**
   * A workout exercise can't be pushed while its exercise has no server id. That's only a problem once the server
   * rejected the create of the exercise (it was pushed right before the workouts): then the workout is listed in the
   * sync problems until the exercise is saved, changed or removed from the workout.
   */
  private noteUnsavedExercise(blocked: Map<string, SyncProblem>, workout: Workout, exercise: Exercise | null | undefined): void {
    if (!exercise || exercise.serverId !== null) return;
    if (!this.ctx.status().rejectedCreates[exercise.clientUUID.toLowerCase()]) return;
    const key = workout.clientUUID.toLowerCase();
    if (blocked.has(key)) return;
    blocked.set(key, {
      id: `workout-${key}`,
      title: `The workout “${workout.name}” is not saved`,
      message: `It contains the exercise “${exercise.name}”, which could not be saved. The workout ${workout.serverId === null ? "only exists on this device" : "is only changed on this device"} and is sent again with every sync. Change the exercise or remove it from the workout to fix this.`,
      date: this.ctx.status().blockedWorkouts[key]?.date ?? new Date(),
    });
  }

  private async create(workout: Workout, blocked: Map<string, SyncProblem>): Promise<void> {
    const rows = await this.db.workoutExercises.where("workoutId").equals(workout.id).toArray();
    const exercises = await exercisesById(this.db);
    const sent = newWorkoutRequest(workout, rows, exercises);
    if (!sent) {
      // An exercise isn't created yet
      for (const row of rows) this.noteUnsavedExercise(blocked, workout, row.exerciseId === null ? null : exercises.get(row.exerciseId));
      return;
    }
    const dto = await this.api.workouts.create(sent);
    await this.ctx.transaction(async () => {
      const current = await this.db.workouts.get(workout.id);
      if (!current) {
        await addPendingDeletion(this.db, "workout", dto.id);
        return;
      }
      const currentRows = await this.db.workoutExercises.where("workoutId").equals(workout.id).toArray();
      if (sameJSON(newWorkoutRequest(current, currentRows, await exercisesById(this.db)), sent)) {
        await this.apply(dto, current, currentRows);
        return;
      }
      // Changed while it was being sent: keep the local version and update the server with the next sync
      await this.db.workouts.put({ ...current, serverId: dto.id, syncState: "updated" });
      const byUUID = new Map(currentRows.map((row) => [row.clientUUID.toLowerCase(), row]));
      for (const created of dto.exercises) {
        const row = created.clientUuid ? byUUID.get(created.clientUuid.toLowerCase()) : undefined;
        if (!row) {
          // Removed while the workout was being created (not on iOS, which keeps it on the server)
          await addPendingDeletion(this.db, "workoutExercise", created.id);
        } else if (row.serverId === null) {
          await this.db.workoutExercises.put({ ...row, serverId: created.id, syncState: "updated" });
        }
      }
    });
  }

  /**
   * Updates the workout, which also finishes or continues it, and its exercises with one request. The exercise changes
   * are in the local order and the server applies them in that order: an exercise inserted or moved to its index shifts
   * the following ones, so after each change the exercises up to that index are where they are locally. An exercise
   * that can't be pushed (yet) is left out, the others are pushed anyway.
   */
  private async update(workout: Workout, serverId: number, blocked: Map<string, SyncProblem>): Promise<void> {
    const sent = workoutUpdateRequest(workout);
    const workoutChanged = workout.syncState !== "synced";

    const sorted = (await this.db.workoutExercises.where("workoutId").equals(workout.id).toArray()).sort(
      (a, b) => a.index - b.index,
    );
    const changes: SentExerciseChange[] = [];
    // The position on the server: the local one without the exercises skipped so far, which aren't on the server.
    // Once a skipped one is added at its position, the server moves the following ones back to their local positions.
    let index = 0;
    for (const workoutExercise of sorted) {
      const exercise = workoutExercise.exerciseId === null ? null : await this.db.exercises.get(workoutExercise.exerciseId);
      if (workoutExercise.serverId === null) {
        const draft = workoutExerciseDraft(workoutExercise, exercise, index);
        if (!draft) {
          this.noteUnsavedExercise(blocked, workout, exercise);
          continue;
        }
        draft.clientUuid = workoutExercise.clientUUID;
        changes.push({ op: "create", rowId: workoutExercise.id, index, draft });
      } else if (workoutExercise.syncState !== "synced") {
        const update = workoutExerciseUpdateRequest(workoutExercise, exercise, index);
        if (!update) {
          this.noteUnsavedExercise(blocked, workout, exercise);
          index += 1;
          continue;
        }
        changes.push({ op: "update", rowId: workoutExercise.id, index, id: workoutExercise.serverId, update });
      }
      index += 1;
    }
    if (!workoutChanged && changes.length === 0) return;

    const exerciseChanges = changes.map(
      (change): WorkoutExerciseChange =>
        change.op === "create" ? { op: "create", ...change.draft } : { op: "update", id: change.id, ...change.update },
    );
    this.ctx.ensureRunning();
    let dto: WorkoutDTO;
    try {
      dto = await this.api.workouts.update(serverId, { ...(workoutChanged && sent), exerciseChanges });
    } catch (error) {
      // The exercise was deleted on another device. The request is atomic, so nothing was saved: the pull of this sync
      // removes the exercise locally and runs the sync once more, which removes the row
      // (removeOrphanedWorkoutExercises) and pushes the rest of the workout.
      if (!isExerciseNotFound(error)) throw error;
      logSync.error(`The exercise of a workout exercise of ${workout.name} doesn't exist on the server anymore`);
      await removeSyncTime(this.db, "exercises");
      return;
    }

    await this.ctx.transaction(async () => {
      for (const change of changes) {
        const current = await this.db.workoutExercises.get(change.rowId);
        if (change.op === "create") {
          const uuid = change.draft.clientUuid?.toLowerCase();
          const created = dto.exercises.find((entry) => entry.clientUuid?.toLowerCase() === uuid);
          if (!created) continue;
          if (!current) {
            await addPendingDeletion(this.db, "workoutExercise", created.id);
            continue;
          }
          const currentExercise = current.exerciseId === null ? null : await this.db.exercises.get(current.exerciseId);
          const currentDraft = workoutExerciseDraft(current, currentExercise, change.index);
          if (currentDraft) currentDraft.clientUuid = current.clientUUID;
          await this.db.workoutExercises.put({
            ...current,
            serverId: created.id,
            syncState: sameJSON(currentDraft, change.draft) ? "synced" : "updated",
          });
        } else {
          if (!current) continue;
          const currentExercise = current.exerciseId === null ? null : await this.db.exercises.get(current.exerciseId);
          if (sameJSON(workoutExerciseUpdateRequest(current, currentExercise, change.index), change.update)) {
            await this.db.workoutExercises.put({ ...current, syncState: "synced" });
          }
        }
      }
      if (workoutChanged) {
        const current = await this.db.workouts.get(workout.id);
        if (current && sameJSON(workoutUpdateRequest(current), sent)) {
          await this.db.workouts.put({ ...current, syncState: "synced" });
        }
      }
    });
  }

  // MARK: - Pull

  async pull(): Promise<void> {
    const syncTime = await getSyncTime(this.db, "workouts");
    if (syncTime) {
      const delta = await loadDelta<WorkoutDeltaDTO>(() => this.api.workouts.changes(syncTime));
      if (delta) {
        await this.ctx.transaction(async () => {
          const local = await this.db.workouts.toArray();
          for (const change of delta.updates) {
            const workout = workoutOfChange(change);
            const match = findMatching(local, change.id, workout?.clientUuid);
            if (workout) {
              await this.upsert(workout, match, local);
            } else if (match && match.syncState === "synced") {
              // A workout in progress that is open is closed by its screen
              await deleteLocally(this.ctx, "workout", match.id);
              local.splice(local.indexOf(match), 1);
            }
          }
          await setSyncTime(this.db, "workouts", delta.syncTime);
        });
        return;
      }
    }

    const list = await this.api.workouts.all();
    await this.ctx.transaction(async () => {
      const local = await this.db.workouts.toArray();
      const kept = new Set<LocalId>();
      for (const dto of list.workouts) {
        kept.add((await this.upsert(dto, findMatching(local, dto.id, dto.clientUuid), local)).id);
      }
      for (const workout of [...local]) {
        if (workout.syncState === "synced" && !kept.has(workout.id)) await deleteLocally(this.ctx, "workout", workout.id);
      }
      await setSyncTime(this.db, "workouts", list.syncTime);
    });
  }

  /**
   * A workout with local changes isn't overwritten, e.g. the workout in progress while the user enters a set.
   * Workouts in progress are overwritten otherwise, they may have been changed on another device.
   */
  private async upsert(dto: WorkoutDTO, match: Workout | undefined, local: Workout[]): Promise<Workout> {
    const rows = match ? await this.db.workoutExercises.where("workoutId").equals(match.id).toArray() : [];
    if (match && (match.syncState !== "synced" || rows.some((row) => row.syncState !== "synced"))) {
      if (match.serverId !== null) return match;
      const updated: Workout = { ...match, serverId: dto.id, syncState: "updated" };
      await this.db.workouts.put(updated);
      local[local.indexOf(match)] = updated;
      return updated;
    }
    const workout = await this.apply(dto, match ?? null, rows);
    if (match) local[local.indexOf(match)] = workout;
    else local.push(workout);
    return workout;
  }

  /** `workout.apply(dto, exercises:)` inside a transaction */
  private async apply(dto: WorkoutDTO, existing: Workout | null, rows: WorkoutExercise[]): Promise<Workout> {
    const applied = applyWorkoutDTO(dto, existing, rows, await exercisesByServerId(this.db));
    if (!applied.complete) logSync.error(`The workout ${dto.id} contains an unknown exercise`);
    if (applied.deletedWorkoutExerciseIds.length > 0) {
      await this.db.workoutExercises.bulkDelete(applied.deletedWorkoutExerciseIds);
    }
    await this.db.workouts.put(applied.workout);
    await this.db.workoutExercises.bulkPut(applied.workoutExercises);
    return applied.workout;
  }
}
