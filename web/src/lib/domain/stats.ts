// Port of ios/Gym 2.0/Core/Domain/StatsCalculator.swift

import type { UnitSystem, Workout, WorkoutExercise } from "@/types/models";
import { formatNumber, formatWeight } from "./units";
import { numberOfSets, volume as volumeOf } from "./workout-exercise";

export interface StatsMetric {
  /** Whether any of the exercises tracks it */
  isTracked: boolean;
  total: number;
  /** Entries with a value other than 0 */
  count: number;
  max: number;
}

interface PersonalRecord {
  weight: number;
  /** 0 if the exercise doesn't track reps */
  reps: number;
}

interface StatsSummary {
  workouts: number;
  /** In minutes, only for summaries of whole workouts */
  duration: number;
  /** A right and a left entry of a unilateral exercise are one set */
  sets: number;

  reps: StatsMetric;
  /** Sum of reps x weight, only of exercises that track both */
  volume: number;
  weights: StatsMetric;
  /** The heaviest weight, with the most reps done with it */
  personalRecord: PersonalRecord | null;
  /** In seconds */
  time: StatsMetric;
  intensity: StatsMetric;
  /** In meters */
  distance: StatsMetric;
}

function emptyMetric(): StatsMetric {
  return { isTracked: false, total: 0, count: 0, max: 0 };
}

function emptySummary(): StatsSummary {
  return {
    workouts: 0,
    duration: 0,
    sets: 0,
    reps: emptyMetric(),
    volume: 0,
    weights: emptyMetric(),
    personalRecord: null,
    time: emptyMetric(),
    intensity: emptyMetric(),
    distance: emptyMetric(),
  };
}

/** The average per entry that has a value, null if none has */
export function metricAverage(metric: StatsMetric): number | null {
  return metric.count > 0 ? metric.total / metric.count : null;
}

function addValues(metric: StatsMetric, values: number[] | null) {
  if (!values) return;
  metric.isTracked = true;
  for (const value of values) {
    if (value === 0) continue;
    metric.total += value;
    metric.count += 1;
    metric.max = Math.max(metric.max, value);
  }
}

/**
 * Over single exercises of workouts, e.g. all the times one exercise was done. `workouts` counts the workouts they
 * are part of, `duration` stays 0.
 */
export function summaryOfWorkoutExercises(workoutExercises: readonly WorkoutExercise[]): StatsSummary {
  const summary = emptySummary();
  summary.workouts = new Set(workoutExercises.map((workoutExercise) => workoutExercise.workoutId)).size;

  for (const workoutExercise of workoutExercises) {
    summary.sets += numberOfSets(workoutExercise);
    addValues(summary.reps, workoutExercise.reps);
    addValues(summary.weights, workoutExercise.weights);
    addValues(summary.time, workoutExercise.time);
    addValues(summary.intensity, workoutExercise.intensity);
    addValues(summary.distance, workoutExercise.distance);
    summary.volume += volumeOf(workoutExercise);

    workoutExercise.weights?.forEach((weight, index) => {
      if (weight <= 0) return;
      const reps = workoutExercise.reps?.[index] ?? 0;
      const record = summary.personalRecord;
      if (record && (weight < record.weight || (weight === record.weight && reps <= record.reps))) return;
      summary.personalRecord = { weight, reps };
    });
  }
  return summary;
}

/** Over the finished workouts, including their duration */
export function summaryOfWorkouts(
  workouts: readonly (Workout & { workoutExercises: readonly WorkoutExercise[] })[],
): StatsSummary {
  const summary = summaryOfWorkoutExercises(workouts.flatMap((workout) => workout.workoutExercises));
  summary.workouts = workouts.length;
  summary.duration = workouts.reduce((sum, workout) => sum + workout.duration, 0);
  return summary;
}

// MARK: - Formatting

/** e.g. "1 h 5 min" */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  return `${Math.trunc(minutes / 60)} h ${minutes % 60} min`;
}

/** e.g. "45 s", "2 min 5 s" or "1 h 2 min" */
export function formatTime(seconds: number): string {
  const rounded = Math.sign(seconds) * Math.round(Math.abs(seconds));
  if (rounded < 60) return `${rounded} s`;
  if (rounded < 3600) {
    const minutes = Math.trunc(rounded / 60);
    return rounded % 60 === 0 ? `${minutes} min` : `${minutes} min ${rounded % 60} s`;
  }
  return formatDuration(Math.trunc(rounded / 60));
}

/** The time of a single set, e.g. "0:45", "1:30" or "1:00:00" */
export function formatSetTime(seconds: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  if (seconds >= 3600) {
    return `${Math.trunc(seconds / 3600)}:${pad(Math.trunc(seconds / 60) % 60)}:${pad(seconds % 60)}`;
  }
  return `${Math.trunc(seconds / 60)}:${pad(seconds % 60)}`;
}

/** e.g. "lvl 5.5" */
export function formatIntensity(intensity: number): string {
  return `lvl ${formatNumber(intensity, 1)}`;
}

/** e.g. "10x 100.0 kg", or only the weight if the exercise doesn't track reps */
export function formatRecord(record: PersonalRecord, unit: UnitSystem): string {
  const weight = formatWeight(record.weight, unit);
  return record.reps > 0 ? `${record.reps}x ${weight}` : weight;
}
