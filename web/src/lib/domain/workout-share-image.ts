// Port of ios/Gym 2.0/Core/Domain/WorkoutShareImage.swift: what the image shows that the share button of a past
// workout shares. It is drawn by components/stats/workout-share-image.ts.

import type { UnitSystem, WorkoutWithExercises } from "@/types/models";
import { appLocale } from "./format";
import { entryDescriptions, pastWorkoutSummaryLines, type StatLine } from "./stats-screens";

/**
 * The list of the exercises, in the points of the image. The exercises fill the columns from top to bottom, a column
 * is only added when the ones before are full. An exercise is never split, and with at most `maxLines` lines at
 * least four exercises fit in a column.
 */
export const SHARE_IMAGE_LIST = {
  maxColumns: 3,
  columnHeight: 568,
  /** The line with the name of an exercise */
  nameHeight: 28,
  /** A line with a set */
  lineHeight: 20,
  /** Between two exercises */
  gap: 14,
  /** The most lines under the name of an exercise, the last one is "+ 3 more" if it has more sets */
  maxLines: 5,
} as const;

export interface ShareImageExercise {
  /** The position in the workout, from 1 */
  number: number;
  name: string;
  /** Its sets, e.g. "10x, 60.0 kg" */
  lines: string[];
}

export interface WorkoutShareImageContent {
  name: string;
  /** e.g. "Monday, 12 October 2026 at 18:30" */
  date: string;
  /** The totals next to the body, without the date */
  lines: StatLine[];
  /** The first exercises in the order of the workout, by column: 0...3 columns, as many as they need */
  columns: ShareImageExercise[][];
  /** The number of exercises that didn't fit, shown as "+ 2 more exercises" */
  moreExercises: number;
}

/** The lines under the name of an exercise: its sets, or the first ones and how many are left out */
export function shareImageSetLines(entries: readonly string[]): string[] {
  const { maxLines } = SHARE_IMAGE_LIST;
  if (entries.length <= maxLines) return [...entries];
  return [...entries.slice(0, maxLines - 1), `+ ${entries.length - (maxLines - 1)} more`];
}

export function shareImageExerciseHeight(exercise: ShareImageExercise): number {
  return SHARE_IMAGE_LIST.nameHeight + exercise.lines.length * SHARE_IMAGE_LIST.lineHeight;
}

/** The height of the exercises of a column with the gaps between them */
export function shareImageColumnHeight(column: readonly ShareImageExercise[]): number {
  return column.reduce(
    (height, exercise, index) => height + (index > 0 ? SHARE_IMAGE_LIST.gap : 0) + shareImageExerciseHeight(exercise),
    0,
  );
}

export function workoutShareImageContent(
  workout: WorkoutWithExercises,
  units: { weightUnit: UnitSystem; distanceUnit: UnitSystem },
  locale: string = appLocale(),
): WorkoutShareImageContent {
  const exercises = [...workout.workoutExercises]
    .sort((a, b) => a.index - b.index)
    .map((workoutExercise, index) => ({
      number: index + 1,
      name: workoutExercise.exercise?.name ?? "",
      lines: shareImageSetLines(entryDescriptions(workoutExercise, units)),
    }));

  const columns: ShareImageExercise[][] = [];
  let shown = 0;
  for (const exercise of exercises) {
    const column = columns.at(-1);
    const fits =
      column !== undefined &&
      shareImageColumnHeight(column) + SHARE_IMAGE_LIST.gap + shareImageExerciseHeight(exercise) <=
        SHARE_IMAGE_LIST.columnHeight;
    if (fits) column.push(exercise);
    else if (columns.length < SHARE_IMAGE_LIST.maxColumns) columns.push([exercise]);
    else break;
    shown += 1;
  }

  return {
    name: workout.name,
    date: workout.date.toLocaleString(locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    lines: pastWorkoutSummaryLines(workout, units).filter((line) => line.title !== "Date"),
    columns,
    moreExercises: exercises.length - shown,
  };
}

/** "+ 1 more exercise", null if all exercises are shown */
export function moreExercisesText(count: number): string | null {
  if (count <= 0) return null;
  return count === 1 ? "+ 1 more exercise" : `+ ${count} more exercises`;
}

/** The name of the shared file: the name of the workout without the characters a file name can't have */
export function workoutShareImageFileName(workoutName: string): string {
  const name = workoutName
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${name || "Workout"}.png`;
}
