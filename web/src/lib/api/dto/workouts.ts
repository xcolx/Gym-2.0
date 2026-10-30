// Mirrors ios/Gym 2.0/Core/Networking/DTOs/WorkoutDTOs.swift and backend/app/schemas/workouts.py
//
// Sets are stored per metric: reps[i], weights[i], ... belong to entry i. A metric the exercise doesn't track is null,
// a tracked metric has a value for every entry.

import type { ChangeAction, ISODateString, UUIDString } from "./common";

// MARK: - Responses

export interface WorkoutDTO {
  id: number;
  /** The UUID sent when creating it, only for objects of the current user. Used to match a create whose response was lost. */
  clientUuid: UUIDString | null;
  name: string;
  date: ISODateString;
  /** In minutes. */
  duration: number;
  inProgress: boolean;
  /** Ordered by index. */
  exercises: WorkoutExerciseDTO[];
}

export interface WorkoutExerciseDTO {
  id: number;
  clientUuid: UUIDString | null;
  exerciseId: number;
  unilateral: boolean;
  index: number;

  reps: number[] | null;
  /** In kilograms. */
  weights: number[] | null;
  /** In seconds. */
  time: number[] | null;
  intensity: number[] | null;
  /** In meters. */
  distance: number[] | null;
}

export interface WorkoutListDTO {
  workouts: WorkoutDTO[];
  /** Pass to `workoutApi.changes()` for the next sync. Kept as the server sent it to not lose precision. */
  syncTime: string;
}

/**
 * One changed workout. For created and updated the workout as it is now (with all its exercises), for deletions only
 * the id (the other fields are null on the wire). Use `workoutOfChange()`.
 */
export type WorkoutChangeDTO =
  | (WorkoutDTO & { action: typeof ChangeAction.created | typeof ChangeAction.updated })
  | { id: number; action: typeof ChangeAction.deleted };

export interface WorkoutDeltaDTO {
  updates: WorkoutChangeDTO[];
  syncTime: string;
}

/** The workout of a change, null for deletions (`WorkoutChangeDTO.workout` in Swift) */
export function workoutOfChange(change: WorkoutChangeDTO): WorkoutDTO | null {
  return change.action === 2 ? null : change;
}

// MARK: - Requests

export interface NewWorkout {
  /** If a workout with this UUID already exists, it is returned instead of creating it again. */
  clientUuid: UUIDString | null;
  /** 1 to 25 characters. */
  name: string;
  date: ISODateString;
  /** In minutes, at most 1440. */
  duration: number;
  /** Several workouts can be in progress, the app avoids it. */
  inProgress: boolean;
  /** Their indexes must be exactly 0..<count. */
  exercises: WorkoutExerciseDraft[];
}

/** A workout exercise with its sets. The metrics the exercise doesn't track are null and left out of the request. */
export interface WorkoutExerciseDraft {
  /** Only used when creating. If the workout already contains an exercise with this UUID, it is returned instead. */
  clientUuid: UUIDString | null;
  exerciseId: number;
  unilateral: boolean;
  index: number;

  reps: number[] | null;
  weights: number[] | null;
  time: number[] | null;
  intensity: number[] | null;
  distance: number[] | null;
}

/**
 * Only the fields that are set are changed. The server applies the workout fields first and then `exerciseChanges` in
 * order, all in one transaction: if one of them fails, nothing is changed.
 */
export interface WorkoutUpdate {
  name?: string;
  date?: ISODateString;
  duration?: number;
  /** False finishes the workout, true continues it. */
  inProgress?: boolean;
  /** At most 2 * MAX_EXERCISES. */
  exerciseChanges?: WorkoutExerciseChange[];
}

/**
 * One change of a workout exercise in `WorkoutUpdate.exerciseChanges`: `create` inserts the exercise at its index (the
 * following ones move back by one), `update` changes the exercise with the server id `id`, which has to be part of the
 * workout. Workout exercises are deleted with `workoutApi.deleteExercise()`.
 */
export type WorkoutExerciseChange =
  | ({ op: "create" } & WorkoutExerciseDraft)
  | ({ op: "update"; id: number } & WorkoutExerciseUpdate);

/** Only the fields that are set are changed. When the exercise changes, the sets have to fit the new exercise. */
export interface WorkoutExerciseUpdate {
  exerciseId?: number;
  unilateral?: boolean;
  /** The other exercises of the workout are shifted accordingly. */
  index?: number;

  reps?: number[] | null;
  weights?: number[] | null;
  time?: number[] | null;
  intensity?: number[] | null;
  distance?: number[] | null;
}
