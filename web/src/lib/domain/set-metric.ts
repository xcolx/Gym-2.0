// Port of the SetMetric enum in ios/Gym 2.0/Core/Persistence/Extensions/WorkoutExercise+Helpers.swift. Weights in
// kilograms, time in seconds and distance in meters.

import { SET_METRICS, type Exercise, type SetMetric } from "@/types/models";

export const SET_METRIC_NAMES: Record<SetMetric, string> = {
  reps: "Reps",
  weights: "Weight",
  time: "Time",
  intensity: "Intensity",
  distance: "Distance",
};

interface ValueRange {
  min: number;
  max: number;
}

/** The limits of the server in the stored units, reps are limited lower than on the server. For input fields. */
export const SET_METRIC_RANGES: Record<SetMetric, ValueRange> = {
  reps: { min: 0, max: 999 },
  weights: { min: 0, max: 9999.9 },
  time: { min: 0, max: 86400 },
  intensity: { min: -9999.99, max: 9999.99 },
  distance: { min: 0, max: 999999.999 },
};

/**
 * The values the server accepts, a workout with other values is refused. Negative weights can't be entered in the
 * app, but may come from imports.
 */
export const SET_METRIC_SERVER_RANGES: Record<SetMetric, ValueRange> = {
  ...SET_METRIC_RANGES,
  reps: { min: 0, max: 9999 },
  weights: { min: -9999.9, max: 9999.9 },
};

export function isInRange(value: number, range: ValueRange): boolean {
  return value >= range.min && value <= range.max;
}

/** Whether the exercise tracks the metric (Exercise.tracks(_:)) */
function exerciseTracks(exercise: Exercise, metric: SetMetric): boolean {
  switch (metric) {
    case "reps":
      return exercise.tracksReps;
    case "weights":
      return exercise.tracksWeights;
    case "time":
      return exercise.tracksTime;
    case "intensity":
      return exercise.tracksIntensity;
    case "distance":
      return exercise.tracksDistance;
  }
}

/** The metrics tracked per set by the exercise, in the order they are shown (Exercise.trackedMetrics) */
export function exerciseTrackedMetrics(exercise: Exercise): SetMetric[] {
  return SET_METRICS.filter((metric) => exerciseTracks(exercise, metric));
}
