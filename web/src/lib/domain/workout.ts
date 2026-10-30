// Port of ios/Gym 2.0/Core/Persistence/Extensions/Workout+Helpers.swift (the parts that don't write to the database,
// those are in lib/repo/workouts.ts and use the pure functions below).

import type { LocalId, Muscle, ReferenceData, Workout, WorkoutExercise, WorkoutExerciseWithExercise } from "@/types/models";
import { exercisePrimaryMuscles, exerciseSecondaryMuscles } from "./exercise";
import { startOfWeek } from "./format";
import { entryCount, isEntryEmpty, removeEntry, type SetArrays } from "./workout-exercise";

/** The server takes at most 25 characters for the names of workouts and workout schemes */
export const MAX_WORKOUT_NAME_LENGTH = 25;

/** The longest duration the server stores (minutes, `Limits.duration`), longer ones are cut to it */
const MAX_WORKOUT_DURATION_MINUTES = 1440;

/**
 * The duration field of EditPastWorkoutView: the text to show and the minutes to store (null while it is empty, the
 * stored value returns when the field is left), or null for text that isn't a number (the stored value is shown
 * again). Longer than the server stores is cut to MAX_WORKOUT_DURATION_MINUTES right away, so the field never shows a
 * duration the server won't keep.
 */
export function durationInput(text: string): { text: string; minutes: number | null } | null {
  if (text === "") return { text, minutes: null };
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  if (value <= MAX_WORKOUT_DURATION_MINUTES) return { text, minutes: value };
  return { text: String(MAX_WORKOUT_DURATION_MINUTES), minutes: MAX_WORKOUT_DURATION_MINUTES };
}

/** The name a free workout gets when none was entered (FreeWorkoutView) */
export const DEFAULT_FREE_WORKOUT_NAME = "Free Workout";

/** Finished workouts started in the current week (Workout.currentWeek(), `date > startOfWeek && !inProgress`) */
export function isInCurrentWeek(workout: Workout, now: Date = new Date(), weekStartsOn?: number): boolean {
  return !workout.inProgress && workout.date > startOfWeek(now, weekStartsOn);
}

/** The days shown on Home ("Muscles worked out the last 3 days"), today included */
export const RECENT_DAYS = 3;

/**
 * Finished workouts started today or on the `days - 1` days before (Workout.isRecent), regardless of the week, so the
 * Home screen doesn't start empty on the first day of the week.
 */
export function isRecent(workout: Workout, now: Date = new Date(), days: number = RECENT_DAYS): boolean {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return !workout.inProgress && workout.date >= start;
}

/** Muscles trained in this workout as primary and as secondary muscle (Workout.musclesTrained()) */
export function musclesTrainedInWorkout(
  workout: { workoutExercises: readonly WorkoutExerciseWithExercise[] },
  reference: Pick<ReferenceData, "muscles">,
): [primary: Muscle[], secondary: Muscle[]] {
  const primary: Muscle[] = [];
  const secondary: Muscle[] = [];
  for (const { exercise } of workout.workoutExercises) {
    if (!exercise) continue;
    for (const muscle of exercisePrimaryMuscles(exercise, reference)) {
      if (!primary.includes(muscle)) primary.push(muscle);
    }
    for (const muscle of exerciseSecondaryMuscles(exercise, reference)) {
      if (!secondary.includes(muscle)) secondary.push(muscle);
    }
  }
  return [primary, secondary];
}

/**
 * Muscles trained as primary muscle and muscles only trained as secondary muscle ([Workout].musclesTrained()).
 * A muscle trained as secondary muscle in three exercises counts as trained as primary muscle. Both lists contain a
 * muscle at most once.
 */
export function musclesTrained(
  workouts: readonly { workoutExercises: readonly WorkoutExerciseWithExercise[] }[],
  reference: Pick<ReferenceData, "muscles">,
): [primary: Muscle[], secondary: Muscle[]] {
  const primary: Muscle[] = [];
  let secondary: Muscle[] = [];
  // how many exercises trained the muscle as secondary muscle
  const secondaryCounts = new Map<Muscle, number>();
  for (const workout of workouts) {
    for (const { exercise } of workout.workoutExercises) {
      if (!exercise) continue;
      for (const muscle of exercisePrimaryMuscles(exercise, reference)) {
        if (!primary.includes(muscle)) {
          primary.push(muscle);
          secondary = secondary.filter((other) => other !== muscle);
        }
      }
      for (const muscle of exerciseSecondaryMuscles(exercise, reference)) {
        if (primary.includes(muscle)) continue;
        const count = (secondaryCounts.get(muscle) ?? 0) + 1;
        secondaryCounts.set(muscle, count);
        if (count >= 3) {
          secondary = secondary.filter((other) => other !== muscle);
          primary.push(muscle);
        } else if (!secondary.includes(muscle)) {
          secondary.push(muscle);
        }
      }
    }
  }
  return [primary, secondary];
}

// MARK: - Finishing a workout (Workout.save(_:bodyWeight:))

/** How long after the last change ending the workout asks whether it ended at the last change */
const WORKOUT_END_QUESTION_AFTER_MS = 5 * 60_000;

/**
 * The end to suggest instead of now (`Workout.suggestedEnd`): the last change on this device, if it was after the
 * start and more than WORKOUT_END_QUESTION_AFTER_MS ago. Null without a last change, e.g. on another device.
 */
export function suggestedWorkoutEnd(workout: Pick<Workout, "date">, lastChange: Date | null, now: Date = new Date()): Date | null {
  if (!lastChange || lastChange.getTime() <= workout.date.getTime()) return null;
  return now.getTime() - lastChange.getTime() > WORKOUT_END_QUESTION_AFTER_MS ? lastChange : null;
}

interface FinishedWorkoutPlan {
  /** In minutes since the start, truncated */
  duration: number;
  /**
   * The exercises that stay, with the empty entries removed and consecutive indexes. All of them are marked as
   * changed afterwards (Workout.markChanged()), like the workout itself.
   */
  kept: (Pick<WorkoutExercise, "id" | "index"> & SetArrays)[];
  /** The exercises without any entry left, they are deleted */
  deletedIds: LocalId[];
  /** True if no exercise is left: the workout is deleted instead of finished */
  deleteWorkout: boolean;
}

/**
 * What finishing the workout changes: removes the sets in which nothing was entered and the exercises without sets.
 * `usesBodyweight` tells for every workout exercise whether its exercise uses the bodyweight (in kilograms).
 */
export function planFinishWorkout(
  workout: Workout,
  workoutExercises: readonly WorkoutExercise[],
  usesBodyweight: (workoutExercise: WorkoutExercise) => boolean,
  bodyweight: number,
  now: Date = new Date(),
): FinishedWorkoutPlan {
  const duration = Math.trunc((now.getTime() - workout.date.getTime()) / 60_000);
  const kept: WorkoutExercise[] = [];
  const deletedIds: LocalId[] = [];

  for (const workoutExercise of workoutExercises) {
    const bodyweightExercise = usesBodyweight(workoutExercise);
    let sets: SetArrays = workoutExercise;
    let setIndex = 0;
    while (setIndex < entryCount(sets)) {
      const empty = (index: number) => isEntryEmpty(sets, index, bodyweightExercise, bodyweight);
      if (!workoutExercise.unilateral && empty(setIndex)) {
        sets = removeEntry(sets, setIndex);
      } else if (workoutExercise.unilateral && setIndex % 2 === 0 && empty(setIndex) && empty(setIndex + 1)) {
        sets = removeEntry(removeEntry(sets, setIndex), setIndex);
      } else {
        setIndex += 1;
      }
    }
    if (entryCount(sets) === 0) {
      deletedIds.push(workoutExercise.id);
    } else {
      kept.push({ ...workoutExercise, ...sets });
    }
  }

  // the indexes have to be consecutive for the server
  const ordered = kept
    .sort((a, b) => a.index - b.index)
    .map(({ id, reps, weights, time, intensity, distance }, index) => ({ id, index, reps, weights, time, intensity, distance }));

  return { duration, kept: ordered, deletedIds, deleteWorkout: kept.length === 0 };
}
