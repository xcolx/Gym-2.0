// Ports of the helpers in ios/Gym 2.0/Features/Home/HomeView.swift

import type { Muscle, Workout } from "@/types/models";

/** The total time of the workouts, compact for the home screen cards: "45 min", "2.5 h" or "12 h" */
export function timeWorkedOutShort(workouts: readonly Workout[]): string {
  const totalTime = workouts.reduce((sum, workout) => sum + workout.duration, 0);
  if (totalTime < 60) return `${totalTime} min`;
  // 598 and 599 would be rounded up to 10.0, which is ugly
  if (totalTime < 598) return `${(totalTime / 60).toFixed(1)} h`;
  return `${(totalTime / 60).toFixed(0)} h`;
}

/**
 * How much of the body was trained in the last days, 0 to 100. A muscle only trained as secondary muscle counts a third.
 * `allMuscles`: every muscle of the reference data, none before the first sync (0 then).
 */
export function progressPercentage([primary, secondary]: [Muscle[], Muscle[]], allMuscles: readonly Muscle[]): number {
  if (allMuscles.length === 0) return 0;
  return Math.trunc(((primary.length + 0.33 * secondary.length) / allMuscles.length) * 100);
}

/** The muscles not trained as primary muscle, in the order of `allMuscles` (sorted by name on iOS) */
export function notTrainedMuscles([primary]: [Muscle[], Muscle[]], allMuscles: readonly Muscle[]): Muscle[] {
  const trained = new Set(primary.map((muscle) => muscle.serverId));
  return allMuscles.filter((muscle) => !trained.has(muscle.serverId));
}
