"use client";

import { suggestExercises } from "@/lib/domain/suggest";
import { musclesTrained } from "@/lib/domain/workout";
import { isAlwaysAvailable } from "@/lib/domain/workout-setup";
import { useEquipment, useExercises, useReferenceData, useWorkoutsThisWeek } from "@/lib/repo/hooks";
import type { Exercise } from "@/types/models";

/** The settings of a suggested workout (WorkoutSuggestion.Settings): the selected equipment and the minutes */
export interface SuggestionSettings {
  equipmentIds: readonly number[];
  minutes: number;
}

/**
 * The route of a suggested workout: the local ids of its exercises and its settings in the query, so that it survives a
 * reload and can be shuffled again. Only the query changes with a shuffle, which keeps the page and the typed name.
 */
export function suggestionRoute(exercises: readonly Exercise[], settings: SuggestionSettings): string {
  const query = new URLSearchParams({
    exercises: exercises.map((exercise) => exercise.id).join(","),
    minutes: String(settings.minutes),
    equipment: settings.equipmentIds.join(","),
  });
  return `/workout/suggested?${query}`;
}

/** The local ids of the exercises in the query of a suggestion route */
export function suggestionExerciseIds(query: URLSearchParams): string[] {
  return (query.get("exercises") ?? "").split(",").filter(Boolean);
}

/** The settings in the query of a suggestion route, null if they are missing */
export function suggestionSettings(query: URLSearchParams): SuggestionSettings | null {
  const minutes = Number(query.get("minutes"));
  const equipment = query.get("equipment");
  if (!Number.isFinite(minutes) || minutes <= 0 || equipment === null) return null;
  return { minutes, equipmentIds: equipment.split(",").filter(Boolean).map(Number) };
}

/**
 * Picks the exercises of a suggested workout (WorkoutSuggestion.exercises): the ones with the selected equipment (and
 * the body), preferring the muscles not trained this week. Null while the data is loading.
 */
export function useSuggestWorkout(): ((settings: SuggestionSettings) => Exercise[]) | null {
  const equipment = useEquipment();
  const exercises = useExercises();
  const workoutsThisWeek = useWorkoutsThisWeek();
  const reference = useReferenceData();
  if (!equipment || !exercises || !workoutsThisWeek || !reference) return null;
  return (settings) => {
    const selected = new Set(settings.equipmentIds);
    const available = new Set(equipment.filter((item) => isAlwaysAvailable(item) || selected.has(item.serverId)).map((item) => item.serverId));
    const [trained] = musclesTrained(workoutsThisWeek, reference);
    return suggestExercises(exercises, available, settings.minutes, trained);
  };
}
