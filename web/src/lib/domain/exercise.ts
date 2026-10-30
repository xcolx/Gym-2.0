// Port of ios/Gym 2.0/Core/Persistence/Extensions/Exercise+Helpers.swift. The reference data is passed in as
// `ReferenceData` (see `useReferenceData()` in lib/repo).

import type { Equipment, Exercise, Muscle, MuscleGroup, ReferenceData } from "@/types/models";

export { exerciseTrackedMetrics } from "./set-metric";

/** The limits of the server for custom exercises (CreateExerciseView.swift, backend/app/schemas/exercises.py) */
export const EXERCISE_LIMITS = {
  /** Characters (code points) of the name */
  name: 50,
  description: 1000,
  aliasCount: 20,
  /** Characters of one alias */
  alias: 50,
  /** Images, e.g. one per keyframe of the movement (MAX_EXERCISE_IMAGES of the server) */
  images: 10,
} as const;

/** Names of the equipment for which the bodyweight is the default weight of a set */
export const BODYWEIGHT_EQUIPMENT_NAMES: ReadonlySet<string> = new Set(["Body", "Pull Up Bar"]);

export function exerciseMuscleGroup(exercise: Exercise, reference: ReferenceData): MuscleGroup | null {
  return reference.muscleGroups.get(exercise.muscleGroupId) ?? null;
}

export function exerciseEquipment(exercise: Exercise, reference: Pick<ReferenceData, "equipment">): Equipment | null {
  return reference.equipment.get(exercise.equipmentId) ?? null;
}

/** In the order of the ids, unknown ids left out */
export function musclesWithIds(ids: number[], reference: Pick<ReferenceData, "muscles">): Muscle[] {
  return ids.flatMap((id) => reference.muscles.get(id) ?? []);
}

export function exercisePrimaryMuscles(exercise: Exercise, reference: Pick<ReferenceData, "muscles">): Muscle[] {
  return musclesWithIds(exercise.primaryMuscleIds, reference);
}

export function exerciseSecondaryMuscles(exercise: Exercise, reference: Pick<ReferenceData, "muscles">): Muscle[] {
  return musclesWithIds(exercise.secondaryMuscleIds, reference);
}

/** The shown name first, then the aliases, which are only used by the search (Exercise.searchNames) */
export function exerciseSearchNames(exercise: Pick<Exercise, "name" | "aliases">): string[] {
  return [exercise.name, ...exercise.aliases];
}

/** Whether the bodyweight is the default weight of a set of the exercise */
export function exerciseUsesBodyweight(exercise: Exercise, reference: Pick<ReferenceData, "equipment">): boolean {
  return BODYWEIGHT_EQUIPMENT_NAMES.has(exerciseEquipment(exercise, reference)?.name ?? "");
}

/** Verified exercises can't be changed. */
export function exerciseCanEdit(exercise: Exercise): boolean {
  return !exercise.verified;
}

/**
 * The set data of performed workouts depends on the tracked metrics, so those can't be changed once the exercise is
 * part of a workout. `isInUse`: whether a workout exercise references it (see `useExerciseInUse()` in lib/repo/hooks.ts).
 */
export function exerciseCanChangeTrackedMetrics(exercise: Exercise, isInUse: boolean): boolean {
  return !exercise.verified && !isInUse;
}
