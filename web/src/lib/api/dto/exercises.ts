// Mirrors ios/Gym 2.0/Core/Networking/DTOs/ExerciseDTOs.swift and backend/app/schemas/exercises.py

import type { ChangeAction, UUIDString } from "./common";

export interface ExerciseDTO {
  id: number;
  /** The UUID sent when creating it, only for objects of the current user. Used to match a create whose response was lost. */
  clientUuid: UUIDString | null;
  name: string;
  /** Other names of the exercise, only used by the search and not shown. */
  aliases: string[];
  description: string | null;
  /** Image hashes in the order they are shown, served by GET /images/{hash}. */
  imageUrls: string[];
  muscleGroupId: number;
  equipmentId: number;
  verified: boolean;

  // Tracked metrics
  reps: boolean;
  weights: boolean;
  time: boolean;
  intensity: boolean;
  distance: boolean;

  primaryMuscleIds: number[];
  secondaryMuscleIds: number[];
}

/** The fields for creating or updating an exercise. Sent as multipart/form-data together with the new images. */
export interface ExerciseDraft {
  /** Only used when creating. If an exercise with this UUID already exists, it is returned instead of creating it again. */
  clientUuid: UUIDString | null;
  /** At most 50 characters. */
  name: string;
  /** At most 20 with at most 50 characters each. Duplicates and the name itself are ignored by the server. */
  aliases: string[];
  /** At most 1000 characters. */
  description: string | null;
  /**
   * Only used when updating: the uploaded images to keep, in their order. The new images follow them, the other
   * uploaded images are removed.
   */
  imageUrls: string[];
  muscleGroupId: number;
  equipmentId: number;
  primaryMuscleIds: number[];
  secondaryMuscleIds: number[];

  // Tracked metrics, at least one has to be true
  reps: boolean;
  weights: boolean;
  time: boolean;
  intensity: boolean;
  distance: boolean;
}

export interface ExerciseListDTO {
  exercises: ExerciseDTO[];
  /** Pass to `exerciseApi.changes()` for the next sync. Kept as the server sent it to not lose precision. */
  syncTime: string;
}

/** One changed exercise. The backend sends the exercise fields and the action in the same object, also for deletions. */
export type ExerciseChangeDTO = ExerciseDTO & { action: ChangeAction };

export interface ExerciseDeltaDTO {
  updates: ExerciseChangeDTO[];
  syncTime: string;
}

export interface EquipmentDTO {
  id: number;
  name: string;
}

export interface MuscleGroupDTO {
  id: number;
  name: string;
}

export interface MuscleDTO {
  id: number;
  name: string;
  /** Image hash, served by GET /images/{hash}. */
  imageUrl: string;
}
