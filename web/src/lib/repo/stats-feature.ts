import { requireDb, type GymDB } from "@/lib/db";
import { planLegacyWorkoutImport, type LegacyWorkoutImportPlan } from "@/lib/domain/legacy-workout-import";
import type { HistoryEntry } from "@/lib/domain/stats-screens";
import { planWorkoutImport, type WorkoutFile, type WorkoutImportPlan } from "@/lib/domain/workout-file";
import type { LocalId } from "@/types/models";
import { useDbQuery } from "./hooks";

/** The exercise in the finished workouts, the newest workout first */
export async function exerciseHistory(db: GymDB, exerciseId: LocalId): Promise<HistoryEntry[]> {
  const workoutExercises = await db.workoutExercises.where("exerciseId").equals(exerciseId).toArray();
  if (workoutExercises.length === 0) return [];
  const workouts = await db.workouts.bulkGet([...new Set(workoutExercises.map((we) => we.workoutId))]);
  const finished = new Map(
    workouts.flatMap((workout) => (workout && !workout.inProgress ? [[workout.id, workout] as const] : [])),
  );
  return workoutExercises
    .flatMap((we) => {
      const workout = finished.get(we.workoutId);
      return workout ? [{ ...we, workout: { id: workout.id, name: workout.name, date: workout.date } }] : [];
    })
    .sort((a, b) => b.workout.date.getTime() - a.workout.date.getTime() || a.index - b.index);
}

/** The exercise in the finished workouts, the newest first (ExercisesStatsDetailView) */
export function useExerciseHistory(exerciseId: LocalId | null | undefined): HistoryEntry[] | undefined {
  return useDbQuery(async (db) => (exerciseId ? exerciseHistory(db, exerciseId) : []), [exerciseId]);
}

/**
 * What importing the file would insert (`WorkoutFile.makeWorkouts(context:)`), checked against the exercises and
 * the workouts of the current user. Insert the result with `importWorkouts(plan.workouts)`.
 */
export async function planImportOfWorkoutFile(file: WorkoutFile, locale?: string): Promise<WorkoutImportPlan> {
  const db = requireDb();
  const [exercises, workouts] = await Promise.all([db.exercises.toArray(), db.workouts.toArray()]);
  return planWorkoutImport(file, exercises, workouts, locale);
}

/**
 * What importing the CSV of an earlier version would insert, with its exercises matched by name
 * (`LegacyWorkoutImport.plan`). Insert the result with `importWorkouts(plan.workouts)`.
 */
export async function planLegacyImportOfWorkoutFile(
  file: WorkoutFile,
  locale?: string,
): Promise<LegacyWorkoutImportPlan> {
  const db = requireDb();
  const [exercises, workouts] = await Promise.all([db.exercises.toArray(), db.workouts.toArray()]);
  return planLegacyWorkoutImport(file, exercises, workouts, locale);
}
