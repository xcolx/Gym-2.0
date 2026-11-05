import type { Exercise, UnitSystem, WorkoutExercise, WorkoutWithExercises } from "@/types/models";
import { formatDate } from "./format";
import {
  formatDuration,
  formatIntensity,
  formatRecord,
  formatTime,
  metricAverage,
  summaryOfWorkoutExercises,
  summaryOfWorkouts,
  type StatsMetric,
} from "./stats";
import { formatDistance, formatNumber, formatVolume } from "./units";
import { entryCount, entryDescription } from "./workout-exercise";

export interface StatLine {
  title: string;
  value: string;
}

interface DisplayUnits {
  weightUnit: UnitSystem;
  distanceUnit: UnitSystem;
}

// MARK: - Past workouts

/** Time and sets, and the metrics tracked by at least one of the exercises of the workout (`summaryLines()`) */
export function pastWorkoutSummaryLines(workout: WorkoutWithExercises, units: DisplayUnits): StatLine[] {
  const summary = summaryOfWorkouts([workout]);
  const lines: StatLine[] = [
    { title: "Date", value: formatDate(workout.date) },
    { title: "Time trained", value: formatDuration(summary.duration) },
    { title: "Sets", value: String(summary.sets) },
  ];
  if (summary.reps.isTracked) lines.push({ title: "Reps", value: String(Math.trunc(summary.reps.total)) });
  if (workout.workoutExercises.some((we) => we.reps !== null && we.weights !== null)) {
    lines.push({ title: "Volume", value: formatVolume(summary.volume, units.weightUnit) });
  }
  if (summary.time.isTracked) lines.push({ title: "Exercise time", value: formatTime(summary.time.total) });
  if (summary.intensity.isTracked) {
    const average = metricAverage(summary.intensity);
    lines.push({ title: "Avg intensity", value: average === null ? "–" : formatIntensity(average) });
  }
  if (summary.distance.isTracked) {
    lines.push({ title: "Distance", value: formatDistance(summary.distance.total, units.distanceUnit) });
  }
  return lines;
}

/** Every entry of the exercise, e.g. "R 10x, 50.0 kg" */
export function entryDescriptions(workoutExercise: WorkoutExercise, units: DisplayUnits): string[] {
  return Array.from({ length: entryCount(workoutExercise) }, (_, index) =>
    entryDescription(workoutExercise, index, units.weightUnit, units.distanceUnit),
  );
}

/** The text the share button of a past workout shares (`getShareText()`) */
export function pastWorkoutShareText(workout: WorkoutWithExercises, units: DisplayUnits, now: Date = new Date()): string {
  // "just completed" only fits a workout of the last day
  const isRecent = now.getTime() - workout.date.getTime() < 24 * 60 * 60 * 1000;
  let text = isRecent
    ? "I just completed a workout and tracked it with Gym 2.0! Check it out:"
    : "I tracked a workout with Gym 2.0! Check it out:";
  text += "\n\n";
  text += workout.name;
  text += "\n";
  text += pastWorkoutSummaryLines(workout, units)
    .map((line) => `${line.title}: ${line.value}`)
    .join("\n");
  text += "\n\n";
  for (const workoutExercise of [...workout.workoutExercises].sort((a, b) => a.index - b.index)) {
    let description = "💪";
    description += workoutExercise.exercise?.name ?? "";
    description += "\n";
    for (const entry of entryDescriptions(workoutExercise, units)) description += `${entry}\n`;
    text += `${description}\n`;
  }
  return text;
}

// MARK: - Interesting facts

export function interestingFactShareText(factText: string): string {
  return "Look at this cool fact the Gym 2.0 app told me about my workouts: \n \n" + factText;
}

// MARK: - Exercises

/** A workout exercise of a finished workout, with the workout it belongs to */
export type HistoryEntry = WorkoutExercise & { workout: { id: string; name: string; date: Date } };

/** The tiles of the totals of an exercise, only the values the exercise tracks (`statTiles`) */
export function exerciseStatsLines(
  exercise: Exercise,
  history: readonly WorkoutExercise[],
  units: DisplayUnits,
): StatLine[] {
  const summary = summaryOfWorkoutExercises(history);
  const { weightUnit, distanceUnit } = units;
  // "–" if no value was entered yet
  const average = (metric: StatsMetric, format: (value: number) => string) => {
    const value = metricAverage(metric);
    return value === null ? "–" : format(value);
  };
  const maximum = (metric: StatsMetric, format: (value: number) => string) =>
    metric.count > 0 ? format(metric.max) : "–";

  const lines: StatLine[] = [
    { title: "Workouts", value: String(summary.workouts) },
    { title: "Sets", value: String(summary.sets) },
  ];
  if (exercise.tracksReps) {
    lines.push({ title: "Total reps", value: String(Math.trunc(summary.reps.total)) });
    lines.push({ title: "Avg reps per set", value: average(summary.reps, (value) => formatNumber(value, 1)) });
  }
  if (exercise.tracksWeights) {
    if (exercise.tracksReps) lines.push({ title: "Volume", value: formatVolume(summary.volume, weightUnit) });
    lines.push({
      title: "Personal record",
      value: summary.personalRecord ? formatRecord(summary.personalRecord, weightUnit) : "–",
    });
  }
  if (exercise.tracksTime) {
    lines.push({ title: "Total time", value: formatTime(summary.time.total) });
    lines.push({ title: "Avg time per set", value: average(summary.time, formatTime) });
    lines.push({ title: "Longest set", value: maximum(summary.time, formatTime) });
  }
  if (exercise.tracksIntensity) {
    lines.push({ title: "Avg intensity", value: average(summary.intensity, formatIntensity) });
    lines.push({ title: "Highest intensity", value: maximum(summary.intensity, formatIntensity) });
  }
  if (exercise.tracksDistance) {
    const distance = (value: number) => formatDistance(value, distanceUnit);
    lines.push({ title: "Total distance", value: distance(summary.distance.total) });
    lines.push({ title: "Avg distance per set", value: average(summary.distance, distance) });
    lines.push({ title: "Longest set", value: maximum(summary.distance, distance) });
  }
  return lines;
}
