// Port of SuggestedWorkoutSettingsView.getSuggestedExerciseList() in
// ios/Gym 2.0/Features/Workout/Setup/SuggestedWorkoutSettingsView.swift

import type { Exercise, Muscle } from "@/types/models";

/** The number of exercises that fit into the time of the workout */
export function suggestedExerciseCount(minutes: number): number {
  const counts: Record<number, number> = { 15: 2, 30: 3, 45: 4, 60: 5 };
  return counts[minutes] ?? Math.trunc(minutes / 15);
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Random exercises that can be done with the available equipment, preferring the ones whose primary muscles weren't
 * trained this week yet.
 *
 * @param exercises all exercises
 * @param availableEquipmentIds server ids of the selected equipment
 * @param minutes the time for the workout
 * @param trainedMuscles the muscles trained as primary muscle this week (`musclesTrained(workoutsThisWeek)[0]`)
 */
export function suggestExercises(
  exercises: readonly Exercise[],
  availableEquipmentIds: ReadonlySet<number>,
  minutes: number,
  trainedMuscles: readonly Muscle[],
  random: () => number = Math.random,
): Exercise[] {
  const possible = exercises.filter((exercise) => availableEquipmentIds.has(exercise.equipmentId));
  const count = suggestedExerciseCount(minutes);

  const trainedIds = new Set(trainedMuscles.map((muscle) => muscle.serverId));
  const optimal = possible.filter((exercise) => !exercise.primaryMuscleIds.some((id) => trainedIds.has(id)));

  const list = shuffled(optimal, random);
  if (list.length < count) {
    for (const exercise of shuffled(possible, random)) {
      if (!list.includes(exercise)) list.push(exercise);
    }
  }
  return list.slice(0, count);
}
