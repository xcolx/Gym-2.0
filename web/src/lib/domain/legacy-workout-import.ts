// Port of ios/Gym 2.0/Features/Stats/ImportExport/LegacyWorkoutImport.swift

import type { Exercise, Workout } from "@/types/models";
import { exerciseSearchNames } from "./exercise";
import { planWorkoutImport, type WorkoutFile, type WorkoutImportPlan } from "./workout-file";

export interface LegacyWorkoutImportPlan extends WorkoutImportPlan {
  /** All workouts of the file */
  totalCount: number;
  /** The exercises that were matched to an exercise with another name, sorted by the name in the file */
  renamedExercises: { legacyName: string; exerciseName: string }[];
  /** The exercises of the file without a match (sorted), the workouts with them are left out */
  unmatchedExerciseNames: string[];
  /** Workouts that are left out, since one of their exercises has no match */
  unmatchedWorkoutCount: number;
}

/** Lowercased words without diacritics and plural "s", split at everything that is no letter or number */
function words(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 0)
    .map((word) => (word.length >= 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word));
}

/** The same words in any order, or the same letters with other spaces ("Pull Up" and "Pullup") */
function keys(name: string): string[] {
  const nameWords = words(name);
  return [[...nameWords].sort().join(" "), nameWords.join("")];
}

/** One word starts with the other one, which isn't much shorter */
function wordsMatch(a: string, b: string): boolean {
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  return longer.startsWith(shorter) && (shorter.length >= 4 || shorter.length === longer.length);
}

function namesMatchLoosely(a: string, b: string): boolean {
  const aWords = words(a);
  const bWords = words(b);
  if (aWords.length === 0 || bWords.length === 0) return false;
  return (
    aWords.every((word) => bWords.some((other) => wordsMatch(word, other))) &&
    bWords.every((word) => aWords.some((other) => wordsMatch(word, other)))
  );
}

/** The exercise of every name of the file that matches one, verified exercises win over custom ones */
export function matchLegacyExercises(names: Iterable<string>, exercises: readonly Exercise[]): Map<string, Exercise> {
  const sorted = [...exercises].sort((a, b) => Number(b.verified) - Number(a.verified));
  const byName = new Map<string, Exercise>();
  const byKey = new Map<string, Exercise>();
  for (const exercise of sorted) {
    if (!byName.has(exercise.name)) byName.set(exercise.name, exercise);
  }
  // The shown names before the aliases, so that an alias never wins over another exercise's name
  for (const pass of [(exercise: Exercise) => [exercise.name], (exercise: Exercise) => exercise.aliases]) {
    for (const exercise of sorted) {
      for (const key of pass(exercise).flatMap(keys)) {
        if (key !== "" && !byKey.has(key)) byKey.set(key, exercise);
      }
    }
  }

  const matches = new Map<string, Exercise>();
  for (const name of names) {
    if (matches.has(name)) continue;
    const match =
      byName.get(name) ??
      keys(name)
        .map((key) => byKey.get(key))
        .find((exercise) => exercise !== undefined);
    if (match) {
      matches.set(name, match);
      continue;
    }
    const loose = sorted.filter((exercise) =>
      exerciseSearchNames(exercise).some((exerciseName) => namesMatchLoosely(name, exerciseName)),
    );
    // Only if it's clear which one, a verified exercise wins over custom ones
    const candidates = loose.some((exercise) => exercise.verified)
      ? loose.filter((exercise) => exercise.verified)
      : loose;
    if (candidates.length === 1) matches.set(name, candidates[0]);
  }
  return matches;
}

/**
 * The workouts of the legacy file to insert, with the matched exercises, see `planWorkoutImport`.
 * `exercises` are the exercises of the user that aren't deleted.
 */
export function planLegacyWorkoutImport(
  file: WorkoutFile,
  exercises: readonly Exercise[],
  existingWorkouts: readonly Workout[],
  locale?: string,
): LegacyWorkoutImportPlan {
  const names = new Set(file.workouts.flatMap((workout) => workout.exercises.map((exercise) => exercise.exercise)));
  const matches = matchLegacyExercises(names, exercises);

  const matchedWorkouts = file.workouts.filter((workout) =>
    workout.exercises.every((exercise) => matches.has(exercise.exercise)),
  );
  // The file with the names of the matched exercises, the exact match of planWorkoutImport finds them
  const matchedFile: WorkoutFile = {
    ...file,
    workouts: matchedWorkouts.map((workout) => ({
      ...workout,
      exercises: workout.exercises.map((exercise) => ({ ...exercise, exercise: matches.get(exercise.exercise)!.name })),
    })),
  };
  const plan = planWorkoutImport(matchedFile, exercises, existingWorkouts, locale);

  return {
    ...plan,
    totalCount: file.workouts.length,
    renamedExercises: [...matches]
      .filter(([legacyName, exercise]) => legacyName !== exercise.name)
      .map(([legacyName, exercise]) => ({ legacyName, exerciseName: exercise.name }))
      .sort((a, b) => a.legacyName.localeCompare(b.legacyName)),
    unmatchedExerciseNames: [...names].filter((name) => !matches.has(name)).sort(),
    unmatchedWorkoutCount: file.workouts.length - matchedWorkouts.length,
  };
}
