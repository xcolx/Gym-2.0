// Port of ios/Gym 2.0/Core/Persistence/Extensions/WorkoutExercise+Helpers.swift. Unlike the Swift methods, which
// mutate the model, these functions are pure and return new arrays.

import { SET_METRICS, type Exercise, type SetMetric, type UnitSystem, type WorkoutExercise } from "@/types/models";
import { roundHalfAwayFromZero } from "./format";
import { formatIntensity, formatSetTime } from "./stats";
import { formatDistance, formatWeight } from "./units";

export type SetArrays = Pick<WorkoutExercise, SetMetric>;

/** Number of entries in the set arrays, unilateral exercises have two entries (right and left) per set */
export function entryCount(sets: SetArrays): number {
  for (const metric of SET_METRICS) {
    const values = sets[metric];
    if (values) return values.length;
  }
  return 0;
}

/** Number of sets, a right and a left entry of a unilateral exercise are one set (getNumberOfSets) */
export function numberOfSets(workoutExercise: SetArrays & Pick<WorkoutExercise, "unilateral">): number {
  const count = entryCount(workoutExercise);
  return workoutExercise.unilateral ? Math.trunc(count / 2) : count;
}

export function totalReps(sets: SetArrays): number {
  return sets.reps?.reduce((sum, reps) => sum + reps, 0) ?? 0;
}

/** Sum of reps x weight, 0 if the exercise does not track both */
export function volume(sets: SetArrays): number {
  const { reps, weights } = sets;
  if (!reps || !weights) return 0;
  let total = 0;
  for (let i = 0; i < Math.min(reps.length, weights.length); i++) total += reps[i] * weights[i];
  return total;
}

/** The metrics with a set array, in the order they are shown */
export function trackedMetrics(sets: SetArrays): SetMetric[] {
  return SET_METRICS.filter((metric) => sets[metric] !== null);
}

/** The default weight of a new entry: the bodyweight (kg) for bodyweight exercises, 0 otherwise */
export function defaultWeight(usesBodyweight: boolean, bodyweight: number): number {
  return usesBodyweight ? bodyweight : 0;
}

/**
 * The set arrays of a new workout exercise: one empty entry (two if unilateral) for every metric the exercise tracks
 * (startSets).
 */
export function startSets(exercise: Exercise, unilateral: boolean, weight: number): SetArrays {
  let sets: SetArrays = {
    reps: exercise.tracksReps ? [] : null,
    weights: exercise.tracksWeights ? [] : null,
    time: exercise.tracksTime ? [] : null,
    intensity: exercise.tracksIntensity ? [] : null,
    distance: exercise.tracksDistance ? [] : null,
  };
  sets = appendEntry(sets, weight);
  if (unilateral) sets = appendEntry(sets, weight);
  return sets;
}

/** Adds one entry to every tracked metric, the weight starts with `weight` (see `defaultWeight`) */
export function appendEntry(sets: SetArrays, weight: number): SetArrays {
  return {
    reps: sets.reps && [...sets.reps, 0],
    weights: sets.weights && [...sets.weights, weight],
    time: sets.time && [...sets.time, 0],
    intensity: sets.intensity && [...sets.intensity, 0],
    distance: sets.distance && [...sets.distance, 0],
  };
}

export function removeEntry(sets: SetArrays, index: number): SetArrays {
  const without = (values: number[] | null) => values && values.filter((_, i) => i !== index);
  return {
    reps: without(sets.reps),
    weights: without(sets.weights),
    time: without(sets.time),
    intensity: without(sets.intensity),
    distance: without(sets.distance),
  };
}

/**
 * Doubles every entry (right and left, the left one 0) when switching to unilateral, keeps only the right side when
 * switching back. Only called together with the switch: a sync that sets unilateral from the server must not convert
 * them again, they were converted on the device that switched it.
 */
export function convertEntries(sets: SetArrays, toUnilateral: boolean): SetArrays {
  const convert = (values: number[] | null) => {
    if (!values) return null;
    if (toUnilateral) return values.flatMap((value) => [value, 0]);
    return values.filter((_, i) => i % 2 === 0);
  };
  return {
    reps: convert(sets.reps),
    weights: convert(sets.weights),
    time: convert(sets.time),
    intensity: convert(sets.intensity),
    distance: convert(sets.distance),
  };
}

/** Reps and time are stored as integers, all metrics are read as numbers. Null if not tracked or out of range. */
export function valueOf(sets: SetArrays, metric: SetMetric, index: number): number | null {
  return sets[metric]?.[index] ?? null;
}

/** Sets the value of an entry, reps and time are rounded. Does nothing if the metric is not tracked (setValue). */
export function withValue(sets: SetArrays, metric: SetMetric, index: number, value: number): SetArrays {
  const values = sets[metric];
  if (!values) return sets;
  const stored = metric === "reps" || metric === "time" ? roundHalfAwayFromZero(value) : value;
  return { ...sets, [metric]: values.map((old, i) => (i === index ? stored : old)) };
}

/**
 * An entry is empty if no value was entered, the values not entered are 0. The weight of a bodyweight exercise starts
 * with the bodyweight (in kilograms), so it counts as not entered as long as it wasn't changed.
 */
export function isEntryEmpty(sets: SetArrays, index: number, usesBodyweight: boolean, bodyweight: number): boolean {
  return trackedMetrics(sets).every((metric) => {
    const value = valueOf(sets, metric, index) ?? 0;
    if (metric === "weights" && usesBodyweight && value === bodyweight) return true;
    return value === 0;
  });
}

/** e.g. "R 10x, 50.0 kg" for the entry at the index, in the units the user picked */
export function entryDescription(
  workoutExercise: SetArrays & Pick<WorkoutExercise, "unilateral">,
  index: number,
  weightUnit: UnitSystem,
  distanceUnit: UnitSystem,
): string {
  const { reps, weights, time, intensity, distance } = workoutExercise;
  const parts: string[] = [];
  if (reps) parts.push(`${reps[index]}x`);
  if (weights) parts.push(formatWeight(weights[index], weightUnit));
  if (time) parts.push(formatSetTime(time[index]));
  if (intensity) parts.push(formatIntensity(intensity[index]));
  if (distance) parts.push(formatDistance(distance[index], distanceUnit));

  const description = parts.join(", ");
  if (workoutExercise.unilateral) {
    return (index % 2 === 0 ? "R " : "L ") + description;
  }
  return description;
}
