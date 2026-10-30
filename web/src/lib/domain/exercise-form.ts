// The UI-independent rules of CreateExerciseView.swift and ExercisesView.swift

import type { Exercise, LocalId, SetMetric } from "@/types/models";
import { SET_METRICS } from "@/types/models";
import { EXERCISE_LIMITS } from "./exercise";
import { characterCount } from "./format";

/** Case-insensitive equality of two names (`caseInsensitiveCompare == .orderedSame`) */
export function isSameName(first: string, second: string): boolean {
  return first.localeCompare(second, undefined, { sensitivity: "accent" }) === 0;
}

export function exerciseNameProblem(
  trimmedName: string,
  { missingSelectionWarning, nameTakenWarning }: { missingSelectionWarning: boolean; nameTakenWarning: boolean },
): string | null {
  if (characterCount(trimmedName) > EXERCISE_LIMITS.name) {
    return `The name can be at most ${EXERCISE_LIMITS.name} characters long.`;
  }
  if (missingSelectionWarning && trimmedName === "") return "Enter a name.";
  if (nameTakenWarning) return "Another exercise already has this name.";
  return null;
}

export function aliasProblem(trimmedAlias: string): string | null {
  if (characterCount(trimmedAlias) <= EXERCISE_LIMITS.alias) return null;
  return `Another name can be at most ${EXERCISE_LIMITS.alias} characters long.`;
}

export function descriptionProblem(trimmedDescription: string): string | null {
  if (characterCount(trimmedDescription) <= EXERCISE_LIMITS.description) return null;
  return `The description can be at most ${EXERCISE_LIMITS.description} characters long.`;
}

/**
 * Adds a typed other name (CreateExerciseView.addAlias). Names that are already there (or the name itself) are
 * ignored like the server does. Returns null if it can't be added (too long, or already the maximum number), the field
 * keeps the text then; otherwise the new list, and the field is cleared.
 */
export function addAlias(aliases: readonly string[], newAlias: string, trimmedName: string): string[] | null {
  const alias = newAlias.trim();
  if (aliasProblem(alias) !== null || aliases.length >= EXERCISE_LIMITS.aliasCount) return null;
  if (alias === "" || isSameName(alias, trimmedName) || aliases.some((existing) => isSameName(existing, alias))) {
    return [...aliases];
  }
  return [...aliases, alias];
}

export function isExerciseNameTaken(exercises: readonly Pick<Exercise, "id" | "name">[], name: string, ownId: LocalId | null): boolean {
  return exercises.some((exercise) => exercise.name === name && exercise.id !== ownId);
}

/** Until the user picks the metrics, they follow the equipment: the weight is not tracked for resistance bands */
export function defaultTrackedMetrics(equipmentName: string): SetMetric[] {
  return equipmentName === "Resistance Band" ? ["reps"] : ["reps", "weights"];
}

/** The metrics in the order they are shown */
export function sortedMetrics(metrics: Iterable<SetMetric>): SetMetric[] {
  const set = new Set(metrics);
  return SET_METRICS.filter((metric) => set.has(metric));
}

/** The tracked metrics as the flags of an exercise */
export function trackingFlags(metrics: Iterable<SetMetric>): Pick<
  Exercise,
  "tracksReps" | "tracksWeights" | "tracksTime" | "tracksIntensity" | "tracksDistance"
> {
  const set = new Set(metrics);
  return {
    tracksReps: set.has("reps"),
    tracksWeights: set.has("weights"),
    tracksTime: set.has("time"),
    tracksIntensity: set.has("intensity"),
    tracksDistance: set.has("distance"),
  };
}

/** The letter an exercise is listed under: the first letter without diacritics in upper case, "#" for others */
export function exerciseLetter(name: string): string {
  const first = Array.from(name.trim())[0] ?? "";
  const folded = first.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase();
  return /^\p{L}/u.test(folded) ? Array.from(folded)[0] : "#";
}

/** The exercises grouped by their first letter, "#" last, the order inside a group kept (ExercisesView.exercisesByLetter) */
export function exercisesByLetter<Item extends { name: string }>(exercises: readonly Item[]): { letter: string; exercises: Item[] }[] {
  const groups = new Map<string, Item[]>();
  for (const exercise of exercises) {
    const letter = exerciseLetter(exercise.name);
    const group = groups.get(letter) ?? [];
    group.push(exercise);
    groups.set(letter, group);
  }
  return [...groups.keys()]
    .sort((a, b) => (a === "#") !== (b === "#") ? (a === "#" ? 1 : -1) : a < b ? -1 : a > b ? 1 : 0)
    .map((letter) => ({ letter, exercises: groups.get(letter)! }));
}
