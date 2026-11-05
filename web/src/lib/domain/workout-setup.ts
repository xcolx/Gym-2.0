// The pure parts of the workout setup of ios/Gym 2.0/Features/Workout (WorkoutView, WorkoutSchemesView,
// EditWorkoutView, SuggestedWorkoutSettingsView, ExercisesView)

import type { Equipment, Exercise, Muscle, ReferenceData } from "@/types/models";

import { appLocale } from "./format";
import { formatRelativeNamed } from "./relative-date";

/**
 * The muscles the exercises train as primary muscle, and the ones they only train as secondary muscle
 * ([Exercise].musclesWorked(in:)), in the order of `muscles` (sorted by name)
 */
export function musclesWorked(
  exercises: readonly Pick<Exercise, "primaryMuscleIds" | "secondaryMuscleIds">[],
  muscles: readonly Muscle[],
): { primary: Muscle[]; secondary: Muscle[] } {
  const primaryIds = new Set(exercises.flatMap((exercise) => exercise.primaryMuscleIds));
  const secondaryIds = new Set(exercises.flatMap((exercise) => exercise.secondaryMuscleIds).filter((id) => !primaryIds.has(id)));
  return {
    primary: muscles.filter((muscle) => primaryIds.has(muscle.serverId)),
    secondary: muscles.filter((muscle) => secondaryIds.has(muscle.serverId)),
  };
}

/** "1 exercise", "3 exercises" */
export function exerciseCountText(count: number): string {
  return count === 1 ? "1 exercise" : `${count} exercises`;
}

/** The line below the name of a saved workout: "3 exercises · last done yesterday" */
export function schemeDetails(exerciseCount: number, lastPerformed: Date | null, now: Date, locale: string = appLocale()): string {
  const details = [exerciseCountText(exerciseCount)];
  if (lastPerformed) details.push(`last done ${formatRelativeNamed(lastPerformed, now, locale)}`);
  return details.join(" · ");
}

/** "Chest · Barbell" below the name of an exercise (RowDetails of ExercisesView) */
export function exerciseDetailsText(
  exercise: Pick<Exercise, "muscleGroupId" | "equipmentId">,
  reference: Pick<ReferenceData, "muscleGroups" | "equipment">,
): string {
  return [reference.muscleGroups.get(exercise.muscleGroupId)?.name, reference.equipment.get(exercise.equipmentId)?.name]
    .filter((name) => name !== undefined)
    .join(" · ");
}

/** The positions (from 1) of an exercise among the picked ones, e.g. [1, 4] if it was picked first and fourth */
export function pickedPositions<Id>(picked: readonly Id[], id: Id): number[] {
  return picked.flatMap((pickedId, index) => (pickedId === id ? [index + 1] : []));
}

/** The picked ones without the last time the exercise was picked */
export function withoutLastPick<Id>(picked: readonly Id[], id: Id): Id[] {
  const last = picked.lastIndexOf(id);
  return last === -1 ? [...picked] : picked.filter((_, index) => index !== last);
}

/** The list with the item at `from` moved to `to` (`.onMove`) */
export function moved<Item>(list: readonly Item[], from: number, to: number): Item[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** e.g. "45 min", "1 h", "1 h 30 min" (SuggestedWorkoutSettingsView.formatTime) */
export function formatWorkoutMinutes(minutes: number): string {
  const hours = Math.trunc(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${rest} min`;
}

/** Bodyweight exercises are always possible, the equipment "Body" is always selected (WorkoutSuggestion) */
export function isAlwaysAvailable(equipment: Pick<Equipment, "name">): boolean {
  return equipment.name === "Body";
}
