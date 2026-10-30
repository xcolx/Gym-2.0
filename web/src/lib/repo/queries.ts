// Every function only uses Dexie calls, so it can run inside `useLiveQuery` and inside transactions.

import type { GymDB } from "@/lib/db";
import { isInCurrentWeek } from "@/lib/domain/workout";
import type {
  ChatWithMembers,
  Exercise,
  LocalId,
  ReferenceData,
  User,
  Workout,
  WorkoutScheme,
  WorkoutSchemeWithExercises,
  WorkoutWithExercises,
} from "@/types/models";
import { sortedSchemeExercises } from "@/lib/api/mapping";
import { chatLastActivity } from "@/lib/domain/chat";

/** Sorts names like SwiftData's default for strings (localized, numbers by value: "Day 2" before "Day 10") */
export function compareNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

const newestFirst = (a: Workout, b: Workout) => b.date.getTime() - a.date.getTime();

export async function exercisesById(db: GymDB): Promise<Map<LocalId, Exercise>> {
  return new Map((await db.exercises.toArray()).map((exercise) => [exercise.id, exercise]));
}

export async function referenceData(db: GymDB): Promise<ReferenceData> {
  const [muscles, muscleGroups, equipment] = await Promise.all([
    db.muscles.toArray(),
    db.muscleGroups.toArray(),
    db.equipment.toArray(),
  ]);
  return {
    muscles: new Map(muscles.map((muscle) => [muscle.serverId, muscle])),
    muscleGroups: new Map(muscleGroups.map((group) => [group.serverId, group])),
    equipment: new Map(equipment.map((item) => [item.serverId, item])),
  };
}

/** The workouts with their exercises sorted by index, in the order of `workouts` */
async function withExercises(db: GymDB, workouts: readonly Workout[]): Promise<WorkoutWithExercises[]> {
  if (workouts.length === 0) return [];
  const [workoutExercises, exercises] = await Promise.all([
    db.workoutExercises
      .where("workoutId")
      .anyOf(workouts.map((workout) => workout.id))
      .toArray(),
    exercisesById(db),
  ]);
  const byWorkout = new Map<LocalId, WorkoutWithExercises["workoutExercises"]>();
  for (const workoutExercise of workoutExercises) {
    const list = byWorkout.get(workoutExercise.workoutId) ?? [];
    list.push({
      ...workoutExercise,
      exercise: workoutExercise.exerciseId === null ? null : (exercises.get(workoutExercise.exerciseId) ?? null),
    });
    byWorkout.set(workoutExercise.workoutId, list);
  }
  return workouts.map((workout) => ({
    ...workout,
    workoutExercises: (byWorkout.get(workout.id) ?? []).sort((a, b) => a.index - b.index),
  }));
}

/** The finished workouts with their exercises, the newest first */
export async function finishedWorkouts(db: GymDB): Promise<WorkoutWithExercises[]> {
  const workouts = await db.workouts.filter((workout) => !workout.inProgress).toArray();
  return withExercises(db, workouts.sort(newestFirst));
}

/** The finished workouts started in the current week, the newest first */
export async function workoutsThisWeek(db: GymDB, now: Date = new Date()): Promise<WorkoutWithExercises[]> {
  const workouts = await db.workouts.filter((workout) => isInCurrentWeek(workout, now)).toArray();
  return withExercises(db, workouts.sort(newestFirst));
}

/** The workouts in progress, the newest first */
export async function workoutsInProgress(db: GymDB): Promise<Workout[]> {
  return (await db.workouts.filter((workout) => workout.inProgress).toArray()).sort(newestFirst);
}

export async function workoutWithExercises(db: GymDB, id: LocalId): Promise<WorkoutWithExercises | null> {
  const workout = await db.workouts.get(id);
  if (!workout) return null;
  return (await withExercises(db, [workout]))[0];
}

/** The schemes with their exercises in order */
export async function schemesWithExercises(db: GymDB, schemes: readonly WorkoutScheme[]): Promise<WorkoutSchemeWithExercises[]> {
  if (schemes.length === 0) return [];
  const [rows, exercises] = await Promise.all([
    db.workoutSchemeExercises
      .where("schemeId")
      .anyOf(schemes.map((scheme) => scheme.id))
      .toArray(),
    exercisesById(db),
  ]);
  return schemes.map((scheme) => ({
    ...scheme,
    exercises: sortedSchemeExercises(
      rows.filter((row) => row.schemeId === scheme.id),
      exercises,
    ),
  }));
}

export async function currentUser(db: GymDB): Promise<User | null> {
  return (await db.users.filter((user) => user.isCurrentUser).first()) ?? null;
}

/** The chats with their members, the most recently active first */
export async function chatsWithMembers(db: GymDB): Promise<ChatWithMembers[]> {
  const [chats, members] = await Promise.all([db.chats.toArray(), db.chatMembers.toArray()]);
  return chats
    .map((chat) => ({ ...chat, members: members.filter((member) => member.chatId === chat.serverId) }))
    .sort((a, b) => chatLastActivity(b).getTime() - chatLastActivity(a).getTime());
}

/**
 * Whether there are local changes the next sync would push (`SyncService.hasUnpushedChanges`): pending deletions and
 * scheme performances, rows that aren't synced, the settings of the current user and chat messages waiting to be sent.
 */
export async function hasUnpushedChanges(db: GymDB): Promise<boolean> {
  const [deletions, performances] = await Promise.all([db.pendingDeletions.count(), db.pendingSchemePerformances.count()]);
  if (deletions > 0 || performances > 0) return true;
  const counts = await Promise.all([
    db.exercises.where("syncState").notEqual("synced").count(),
    db.workouts.where("syncState").notEqual("synced").count(),
    db.workoutExercises.where("syncState").notEqual("synced").count(),
    db.workoutSchemes.where("syncState").notEqual("synced").count(),
  ]);
  if (counts.some((count) => count > 0)) return true;
  const user = await currentUser(db);
  if (user && user.syncState !== "synced") return true;
  return (await db.chats.filter((chat) => chat.inputUUID !== null).count()) > 0;
}
