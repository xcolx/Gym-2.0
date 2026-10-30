// The calculation of ios/Gym 2.0/Features/Stats/Overview/DistributionByMuscleView.swift (getPercentages), with the
// formulas of the iOS app: a secondary muscle counts a third, a unilateral set counts as one set.

import type { Muscle, MuscleGroup, WorkoutWithExercises } from "@/types/models";
import { numberOfSets, totalReps } from "./workout-exercise";

export const VALUE_CRITERIA = ["Reps", "Sets", "Workouts"] as const;
export type ValueCriteria = (typeof VALUE_CRITERIA)[number];

export const CATEGORY_CRITERIA = ["Muscle", "Muscle Group"] as const;
export type CategoryCriteria = (typeof CATEGORY_CRITERIA)[number];

/** The weight of a secondary muscle */
const SECONDARY_FACTOR = 0.33;

/**
 * The bar of every muscle (sorted by name) or muscle group in percent of the highest value, in the order of
 * `muscles` / `muscleGroups`. All 0 if nothing was trained.
 */
export function distributionPercentages(
  workouts: readonly WorkoutWithExercises[],
  muscles: readonly Muscle[],
  muscleGroups: readonly MuscleGroup[],
  value: ValueCriteria,
  category: CategoryCriteria,
): number[] {
  const values =
    category === "Muscle" ? muscleValues(workouts, muscles, value) : muscleGroupValues(workouts, muscleGroups, value);
  const highest = Math.max(0, ...values);
  if (!(highest > 0)) return values;
  return values.map((count) => count / (highest / 100));
}

function muscleValues(
  workouts: readonly WorkoutWithExercises[],
  muscles: readonly Muscle[],
  value: ValueCriteria,
): number[] {
  return muscles.map((muscle) => {
    let count = 0;
    for (const workout of workouts) {
      if (value === "Workouts") {
        // Only the primary muscles count for the workouts
        if (workout.workoutExercises.some((we) => we.exercise?.primaryMuscleIds.includes(muscle.serverId))) count += 1;
        continue;
      }
      for (const workoutExercise of workout.workoutExercises) {
        const exercise = workoutExercise.exercise;
        if (!exercise) continue;
        const amount = value === "Sets" ? numberOfSets(workoutExercise) : totalReps(workoutExercise);
        if (exercise.primaryMuscleIds.includes(muscle.serverId)) count += amount;
        if (exercise.secondaryMuscleIds.includes(muscle.serverId)) count += SECONDARY_FACTOR * amount;
      }
    }
    return count;
  });
}

function muscleGroupValues(
  workouts: readonly WorkoutWithExercises[],
  muscleGroups: readonly MuscleGroup[],
  value: ValueCriteria,
): number[] {
  return muscleGroups.map((muscleGroup) => {
    let count = 0;
    for (const workout of workouts) {
      const ofGroup = workout.workoutExercises.filter((we) => we.exercise?.muscleGroupId === muscleGroup.serverId);
      if (value === "Workouts") {
        if (ofGroup.length > 0) count += 1;
        continue;
      }
      for (const workoutExercise of ofGroup) {
        count += value === "Sets" ? numberOfSets(workoutExercise) : totalReps(workoutExercise);
      }
    }
    return count;
  });
}
