// Ports of ios/Gym 2.0/Core/Domain/StatsOverview.swift and the helpers of the redesigned stats screens
// (ActivityBoardView, StatsView, PastWorkoutsView, ExercisesStatsView, ExercisesStatsDetailView, ExerciseHistoryCard)

import type { Exercise, Muscle, UnitSystem, Workout, WorkoutExercise, WorkoutWithExercises } from "@/types/models";
import { appLocale, startOfWeek } from "./format";
import { fuzzyFilter } from "./fuzzy-search";
import { exerciseSearchNames } from "./exercise";
import type { summaryOfWorkoutExercises } from "./stats";
import { distanceFromMeters, weightFromKilograms } from "./units";
import { numberOfSets, totalReps, volume } from "./workout-exercise";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The share of a set that a secondary muscle gets, like in the distribution by muscle */
const SECONDARY_MUSCLE_SHARE = 0.33;

/** The start of the local day, as the key of `minutesByDay` */
export function dayKey(date: Date): number {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

export interface StatsOverview {
  /** The minutes worked out per day, by `dayKey` */
  minutesByDay: Map<number, number>;
  /** The sets per muscle by its server id: a set counts fully for a primary muscle and a third for a secondary one */
  setsByMuscleId: Map<number, number>;
  /** The different exercises done in the finished workouts */
  exerciseCount: number;
}

/** What the overview of the stats shows besides the totals and the facts (`StatsOverview.make`) */
export function statsOverview(workouts: readonly WorkoutWithExercises[]): StatsOverview {
  const minutesByDay = new Map<number, number>();
  const setsByMuscleId = new Map<number, number>();
  const exerciseIds = new Set<string>();
  const add = (muscleId: number, sets: number) => setsByMuscleId.set(muscleId, (setsByMuscleId.get(muscleId) ?? 0) + sets);

  for (const workout of workouts) {
    const day = dayKey(workout.date);
    minutesByDay.set(day, (minutesByDay.get(day) ?? 0) + workout.duration);
    for (const workoutExercise of workout.workoutExercises) {
      const exercise = workoutExercise.exercise;
      if (!exercise) continue;
      exerciseIds.add(exercise.id);
      const sets = numberOfSets(workoutExercise);
      for (const muscleId of exercise.primaryMuscleIds) add(muscleId, sets);
      for (const muscleId of exercise.secondaryMuscleIds) add(muscleId, SECONDARY_MUSCLE_SHARE * sets);
    }
  }
  return { minutesByDay, setsByMuscleId, exerciseCount: exerciseIds.size };
}

/** The most trained muscles, the most sets first (the muscles of StatsView) */
export function topMuscles(
  muscles: readonly Muscle[],
  setsByMuscleId: ReadonlyMap<number, number>,
  count = 5,
): { muscle: Muscle; sets: number }[] {
  return muscles
    .map((muscle) => ({ muscle, sets: setsByMuscleId.get(muscle.serverId) ?? 0 }))
    .filter((item) => item.sets > 0)
    .sort((a, b) => b.sets - a.sets)
    .slice(0, count);
}

// MARK: - Activity board

/** The weeks of the activity board, a year */
export const ACTIVITY_WEEK_COUNT = 53;

/** The weeks of the last year, oldest first, each with its days from the first weekday */
export function activityWeeks(now: Date, weekStartsOn: number, weekCount = ACTIVITY_WEEK_COUNT): Date[][] {
  const weekStart = startOfWeek(now, weekStartsOn);
  return Array.from({ length: weekCount }, (_, week) => {
    const offset = weekCount - 1 - week;
    return Array.from({ length: 7 }, (_, day) => {
      const date = new Date(weekStart);
      date.setDate(date.getDate() - offset * 7 + day);
      return date;
    });
  });
}

/** How dark a day is on the board: 0 without a workout, 4 from 90 minutes on */
export function activityLevel(minutes: number): 0 | 1 | 2 | 3 | 4 {
  if (minutes < 1) return 0;
  if (minutes < 30) return 1;
  if (minutes < 60) return 2;
  if (minutes < 90) return 3;
  return 4;
}

/**
 * The indices of the weeks that start a month, which get the name of the month above them. Not the first week, and
 * not the last two, where the name would be cut off.
 */
export function monthStartIndices(weeks: readonly Date[][]): Set<number> {
  const indices = new Set<number>();
  weeks.forEach((week, index) => {
    if (index > 0 && index < weeks.length - 2 && week[0].getMonth() !== weeks[index - 1][0].getMonth()) indices.add(index);
  });
  return indices;
}

/** The minutes of the days of the board */
export function minutesSince(minutesByDay: ReadonlyMap<number, number>, firstDay: Date): number {
  const start = dayKey(firstDay);
  let minutes = 0;
  for (const [day, value] of minutesByDay) if (day >= start) minutes += value;
  return minutes;
}

// MARK: - Dates

/** `.dateTime.day().month()`, e.g. "5 Nov" or "Nov 5" depending on the region */
export function formatDayMonth(date: Date, locale: string = appLocale()): string {
  return date.toLocaleDateString(locale, { day: "numeric", month: "short" });
}

/** "today", "yesterday" or the day and month */
export function relativeDay(date: Date, now: Date = new Date(), locale: string = appLocale()): string {
  const days = Math.round((dayKey(now) - dayKey(date)) / DAY_MS);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return formatDayMonth(date, locale);
}

// MARK: - Past workouts

/** The workouts by month, in the order of `workouts` (the newest first) */
export function workoutsByMonth<W extends Pick<Workout, "date">>(workouts: readonly W[]): { month: Date; workouts: W[] }[] {
  const months: { month: Date; workouts: W[] }[] = [];
  for (const workout of workouts) {
    const month = new Date(workout.date.getFullYear(), workout.date.getMonth(), 1);
    const last = months.at(-1);
    if (last && last.month.getTime() === month.getTime()) last.workouts.push(workout);
    else months.push({ month, workouts: [workout] });
  }
  return months;
}

/** "1 set", "2 sets", ... */
export function countOf(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

// MARK: - Exercises

/** The order of the exercises in the stats (ExerciseStatsSort) */
export const EXERCISE_STATS_SORTS = ["Name", "Most done", "Last done"] as const;
export type ExerciseStatsSort = (typeof EXERCISE_STATS_SORTS)[number];

/** An exercise in the list of the stats (ExerciseStatsRow) */
export interface ExerciseStatsRow {
  exercise: Exercise;
  workoutCount: number;
  lastDate: Date;
}

/** Swift's `<` on strings: by Unicode scalars, case sensitive */
export function compareOrdinal(a: string, b: string): number {
  const first = Array.from(a);
  const second = Array.from(b);
  for (let i = 0; i < Math.min(first.length, second.length); i++) {
    const difference = first[i].codePointAt(0)! - second[i].codePointAt(0)!;
    if (difference !== 0) return difference;
  }
  return first.length - second.length;
}

/** The exercises done in the finished workouts, with how often and when they were last done */
export function exerciseStatsRows(workouts: readonly WorkoutWithExercises[]): ExerciseStatsRow[] {
  const rows = new Map<string, { exercise: Exercise; workoutIds: Set<string>; lastDate: Date }>();
  for (const workout of workouts) {
    for (const { exercise } of workout.workoutExercises) {
      if (!exercise) continue;
      const row = rows.get(exercise.id) ?? { exercise, workoutIds: new Set<string>(), lastDate: workout.date };
      row.workoutIds.add(workout.id);
      if (workout.date > row.lastDate) row.lastDate = workout.date;
      rows.set(exercise.id, row);
    }
  }
  return [...rows.values()].map(({ exercise, workoutIds, lastDate }) => ({
    exercise,
    workoutCount: workoutIds.size,
    lastDate,
  }));
}

/** The rows matching the search (incl. the aliases), best match first, or all of them in the order of `sort` */
export function shownExerciseStatsRows(
  rows: readonly ExerciseStatsRow[],
  sort: ExerciseStatsSort,
  searchText: string,
): ExerciseStatsRow[] {
  if (searchText !== "") return fuzzyFilter(rows, searchText, (row) => exerciseSearchNames(row.exercise));
  const byName = (a: ExerciseStatsRow, b: ExerciseStatsRow) => compareOrdinal(a.exercise.name, b.exercise.name);
  switch (sort) {
    case "Name":
      return [...rows].sort(byName);
    case "Most done":
      return [...rows].sort((a, b) => b.workoutCount - a.workoutCount || byName(a, b));
    case "Last done":
      return [...rows].sort((a, b) => b.lastDate.getTime() - a.lastDate.getTime());
  }
}

// MARK: - Progress chart

/** What the progress chart of an exercise shows, one value per time it was done (ExerciseChartMetric) */
export type ExerciseChartMetric = "heaviest" | "volume" | "reps" | "time" | "intensity" | "distance";

export const CHART_METRIC_TITLES: Record<ExerciseChartMetric, string> = {
  heaviest: "Heaviest",
  volume: "Volume",
  reps: "Reps",
  time: "Time",
  intensity: "Intensity",
  distance: "Distance",
};

/** The metrics the exercise tracks */
export function chartMetrics(exercise: Exercise): ExerciseChartMetric[] {
  const metrics: ExerciseChartMetric[] = [];
  if (exercise.tracksWeights) metrics.push("heaviest");
  if (exercise.tracksWeights && exercise.tracksReps) metrics.push("volume");
  if (exercise.tracksReps) metrics.push("reps");
  if (exercise.tracksTime) metrics.push("time");
  if (exercise.tracksIntensity) metrics.push("intensity");
  if (exercise.tracksDistance) metrics.push("distance");
  return metrics;
}

/** The unit of the values of the chart */
export function chartUnit(metric: ExerciseChartMetric, weightSymbol: string, distanceSymbol: string): string {
  switch (metric) {
    case "heaviest":
    case "volume":
      return weightSymbol;
    case "reps":
      return "reps";
    case "time":
      return "min";
    case "intensity":
      return "level";
    case "distance":
      return distanceSymbol;
  }
}

/** The value of one time the exercise was done, in the units of the user, null if no value was entered */
export function chartValue(
  workoutExercise: WorkoutExercise,
  metric: ExerciseChartMetric,
  units: { weightUnit: UnitSystem; distanceUnit: UnitSystem },
): number | null {
  const sum = (values: number[] | null) => (values ?? []).reduce((total, value) => total + value, 0);
  let value: number;
  switch (metric) {
    case "heaviest":
      value = weightFromKilograms(Math.max(0, ...(workoutExercise.weights ?? [])), units.weightUnit);
      break;
    case "volume":
      value = weightFromKilograms(volume(workoutExercise), units.weightUnit);
      break;
    case "reps":
      value = totalReps(workoutExercise);
      break;
    case "time":
      value = sum(workoutExercise.time) / 60;
      break;
    case "intensity": {
      const entered = (workoutExercise.intensity ?? []).filter((intensity) => intensity !== 0);
      value = entered.length === 0 ? 0 : sum(entered) / entered.length;
      break;
    }
    case "distance":
      value = distanceFromMeters(sum(workoutExercise.distance), units.distanceUnit);
      break;
  }
  return value > 0 ? value : null;
}

/** The period the progress chart shows (ExerciseChartRange) */
export const CHART_RANGES = ["3M", "6M", "1Y", "All"] as const;
export type ExerciseChartRange = (typeof CHART_RANGES)[number];

/** The first day of the period, null for all */
export function chartRangeStart(range: ExerciseChartRange, now: Date): Date | null {
  const start = new Date(now);
  switch (range) {
    case "3M":
      start.setMonth(start.getMonth() - 3);
      return start;
    case "6M":
      start.setMonth(start.getMonth() - 6);
      return start;
    case "1Y":
      start.setFullYear(start.getFullYear() - 1);
      return start;
    case "All":
      return null;
  }
}

// MARK: - Personal record

/**
 * The set of the personal record, the first time it was done (ExerciseHistoryCard.recordSet). `history` is the newest
 * first.
 */
export function personalRecordSet(
  exercise: Exercise,
  history: readonly WorkoutExercise[],
  summary: ReturnType<typeof summaryOfWorkoutExercises>,
): { workoutExerciseId: string; index: number } | null {
  const record = summary.personalRecord;
  if (!exercise.tracksWeights || !record) return null;
  for (const workoutExercise of [...history].reverse()) {
    const weights = workoutExercise.weights;
    if (!weights) continue;
    for (let index = 0; index < weights.length; index++) {
      if (weights[index] === record.weight && (workoutExercise.reps?.[index] ?? 0) === record.reps) {
        return { workoutExerciseId: workoutExercise.id, index };
      }
    }
  }
  return null;
}
