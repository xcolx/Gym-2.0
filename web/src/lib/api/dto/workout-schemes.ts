// Mirrors ios/Gym 2.0/Core/Networking/DTOs/WorkoutSchemeDTOs.swift and backend/app/schemas/workout_schemes.py

import type { ChangeAction, ISODateString, UUIDString } from "./common";

// MARK: - Responses

export interface WorkoutSchemeDTO {
  id: number;
  /** The UUID sent when creating it, only for objects of the current user. Used to match a create whose response was lost. */
  clientUuid: UUIDString | null;
  name: string;
  /** When a workout based on this scheme was last started. */
  lastPerformed: ISODateString | null;
  /** Ordered by index. */
  exercises: WorkoutSchemeExerciseDTO[];
}

export interface WorkoutSchemeExerciseDTO {
  id: number;
  exerciseId: number;
  index: number;
}

export interface WorkoutSchemeListDTO {
  schemes: WorkoutSchemeDTO[];
  /** Pass to `workoutSchemeApi.changes()` for the next sync. Kept as the server sent it to not lose precision. */
  syncTime: string;
}

/**
 * One changed scheme. Created and updated should both be treated as an upsert that replaces the complete exercise
 * list. Deletions only carry the id. Use `schemeOfChange()`.
 */
export type WorkoutSchemeChangeDTO =
  | (WorkoutSchemeDTO & { action: typeof ChangeAction.created | typeof ChangeAction.updated })
  | { id: number; action: typeof ChangeAction.deleted };

export interface WorkoutSchemeDeltaDTO {
  updates: WorkoutSchemeChangeDTO[];
  syncTime: string;
}

/** The scheme of a change, null for deletions (`WorkoutSchemeChangeDTO.scheme` in Swift) */
export function schemeOfChange(change: WorkoutSchemeChangeDTO): WorkoutSchemeDTO | null {
  return change.action === 2 ? null : change;
}

// MARK: - Requests

export interface NewWorkoutScheme {
  /** If a scheme with this UUID already exists, it is returned instead of creating it again. */
  clientUuid: UUIDString | null;
  /** 1 to 25 characters. */
  name: string;
  /** Their indexes must be exactly 0..<count. */
  exercises: WorkoutSchemeExerciseDraft[];
}

export interface WorkoutSchemeExerciseDraft {
  exerciseId: number;
  index: number;
}

/** Only the fields that are set are changed. `exercises` replaces the complete list. */
export interface WorkoutSchemeUpdate {
  name?: string;
  exercises?: WorkoutSchemeExerciseDraft[];
}
