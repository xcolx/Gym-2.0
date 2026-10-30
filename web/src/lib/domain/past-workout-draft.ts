// The changes of the draft of EditPastWorkoutView.swift, only stored on "Save" (saveEditedWorkout in lib/repo)

import type { LocalId, SetMetric, WorkoutExerciseWithExercise, WorkoutWithExercises } from "@/types/models";
import { appendEntry, convertEntries, entryCount, removeEntry, withValue } from "./workout-exercise";

/** The changes of one exercise row of the draft, null if nothing changes */
export type RowChanges = Partial<WorkoutExerciseWithExercise> | null;

const pad = (value: number) => String(value).padStart(2, "0");

/** yyyy-MM-dd in the local time zone, the value of a date input */
export function dayInputValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * The date with the day of a date input (yyyy-MM-dd) and the time of `date`, null if the value isn't a day or the
 * result would be in the future
 */
export function withDay(date: Date, value: string, now: number = Date.now()): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  // Only the day changes, the time of the start stays
  const result = new Date(date);
  result.setFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (result.getTime() > now) return null;
  return result;
}

/** The exercises in this order with consecutive indexes */
export function reindexed(rows: WorkoutExerciseWithExercise[]): WorkoutExerciseWithExercise[] {
  return rows.map((row, index) => ({ ...row, index }));
}

/** The exercises without the one at `index`, reindexed */
export function withoutRow(rows: WorkoutExerciseWithExercise[], index: number): WorkoutExerciseWithExercise[] {
  return reindexed(rows.filter((_, i) => i !== index));
}

/** The exercises with the one at `from` moved to `to`, reindexed */
export function movedRow(rows: WorkoutExerciseWithExercise[], from: number, to: number): WorkoutExerciseWithExercise[] {
  const result = [...rows];
  const [moved] = result.splice(from, 1);
  result.splice(to, 0, moved);
  return reindexed(result);
}

/** The draft with the changes of the row with this id applied */
export function changingRow(
  workout: WorkoutWithExercises,
  id: LocalId,
  change: (row: WorkoutExerciseWithExercise) => RowChanges,
): WorkoutWithExercises {
  return {
    ...workout,
    workoutExercises: workout.workoutExercises.map((row) => {
      if (row.id !== id) return row;
      const changes = change(row);
      return changes ? { ...row, ...changes } : row;
    }),
  };
}

/** One more set with the given weight, two entries (right and left) for unilateral exercises */
export function addSetChanges(row: WorkoutExerciseWithExercise, weight: number): RowChanges {
  const once = appendEntry(row, weight);
  return row.unilateral ? appendEntry(once, weight) : once;
}

/** Without the last set, null if it's the only one */
export function removeLastSetChanges(row: WorkoutExerciseWithExercise): RowChanges {
  const count = entryCount(row);
  if (row.unilateral) return count <= 2 ? null : removeEntry(removeEntry(row, count - 1), count - 2);
  return count <= 1 ? null : removeEntry(row, count - 1);
}

/** The value of one entry, null if the metric isn't tracked or the entry doesn't exist */
export function setValueChanges(
  row: WorkoutExerciseWithExercise,
  metric: SetMetric,
  entryIndex: number,
  value: number,
): RowChanges {
  if (!row[metric] || entryIndex < 0 || entryIndex >= entryCount(row)) return null;
  return withValue(row, metric, entryIndex, value);
}

/** The entries converted to or from two per set, null if it's unilateral already (or not) */
export function unilateralChanges(row: WorkoutExerciseWithExercise, unilateral: boolean): RowChanges {
  return row.unilateral === unilateral ? null : { ...convertEntries(row, unilateral), unilateral };
}
