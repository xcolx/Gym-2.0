// The reads of the UI (SwiftData's @Query): every hook re-renders when the data it read changes. Every hook returns
// `undefined` while it loads (or while no database is open), so a component can tell "loading" from "not found"
// (`null`).

import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";

import { useDb, type GymDB } from "@/lib/db";
import { unitOrMetric } from "@/lib/domain/units";
import { sortMessages } from "@/lib/domain/chat";
import type {
  ChatWithMembers,
  Equipment,
  Exercise,
  LocalId,
  Message,
  Muscle,
  MuscleGroup,
  ReferenceData,
  UnitSystem,
  User,
  Workout,
  WorkoutSchemeWithExercises,
  WorkoutWithExercises,
} from "@/types/models";
import {
  compareNames,
  currentUser,
  exercisesById,
  finishedWorkouts,
  referenceData,
  schemesWithExercises,
  workoutsInProgress,
  workoutsThisWeek,
  workoutWithExercises,
} from "./queries";
import { DEFAULT_SCHEME_COLOR, isHexColor } from "./user";

/** A live query on the database of the current user, undefined while it loads or no database is open */
export function useDbQuery<T>(query: (db: GymDB) => Promise<T> | T, deps: readonly unknown[] = []): T | undefined {
  const db = useDb();
  return useLiveQuery(() => (db ? query(db) : undefined), [db, ...deps]);
}

const byName = <Row extends { name: string }>(rows: Row[]) => rows.sort((a, b) => compareNames(a.name, b.name));

// MARK: - Exercises and reference data

/** All exercises (verified and custom), sorted by name */
export function useExercises(): Exercise[] | undefined {
  return useDbQuery(async (db) => byName(await db.exercises.toArray()));
}

/** All exercises by local id */
export function useExerciseMap(): Map<LocalId, Exercise> | undefined {
  return useDbQuery(exercisesById);
}

/** null if it doesn't exist (anymore) */
export function useExercise(id: LocalId | null | undefined): Exercise | null | undefined {
  return useDbQuery(async (db) => (id ? ((await db.exercises.get(id)) ?? null) : null), [id]);
}

/** Whether a workout contains the exercise: it can't be deleted then and its tracked metrics can't be changed */
export function useExerciseInUse(id: LocalId | null | undefined): boolean | undefined {
  return useDbQuery(async (db) => (id ? (await db.workoutExercises.where("exerciseId").equals(id).count()) > 0 : false), [id]);
}

/** Whether a workout scheme contains the exercise: it can't be deleted then, like on the server */
export function useExerciseInScheme(id: LocalId | null | undefined): boolean | undefined {
  return useDbQuery(async (db) => (id ? (await db.workoutSchemeExercises.where("exerciseId").equals(id).count()) > 0 : false), [id]);
}

/** Sorted by name, empty before the first sync */
export function useMuscles(): Muscle[] | undefined {
  return useDbQuery(async (db) => byName(await db.muscles.toArray()));
}

/** Sorted by name */
export function useMuscleGroups(): MuscleGroup[] | undefined {
  return useDbQuery(async (db) => byName(await db.muscleGroups.toArray()));
}

/** Sorted by name */
export function useEquipment(): Equipment[] | undefined {
  return useDbQuery(async (db) => byName(await db.equipment.toArray()));
}

/** Muscles, muscle groups and equipment by server id, to resolve the ids of exercises (lib/domain/exercise) */
export function useReferenceData(): ReferenceData | undefined {
  return useDbQuery(referenceData);
}

// MARK: - Workouts

/** The finished workouts with their exercises, the newest first (for the stats) */
export function useFinishedWorkouts(): WorkoutWithExercises[] | undefined {
  return useDbQuery(finishedWorkouts);
}

/**
 * The finished workouts started in the current week, with their exercises (`Workout.currentWeek()`). The week is
 * checked when the data changes, not at midnight.
 */
export function useWorkoutsThisWeek(): WorkoutWithExercises[] | undefined {
  return useDbQuery((db) => workoutsThisWeek(db));
}

/** The workouts in progress, the newest first. Usually one, several if they were started on different devices. */
export function useWorkoutsInProgress(): Workout[] | undefined {
  return useDbQuery(workoutsInProgress);
}

/** A workout with its exercises sorted by index, null if it doesn't exist (anymore, e.g. deleted on another device) */
export function useWorkout(id: LocalId | null | undefined): WorkoutWithExercises | null | undefined {
  return useDbQuery(async (db) => (id ? workoutWithExercises(db, id) : null), [id]);
}

// MARK: - Workout schemes

/** All schemes with their exercises in order, sorted by name */
export function useSchemes(): WorkoutSchemeWithExercises[] | undefined {
  return useDbQuery(async (db) => schemesWithExercises(db, byName(await db.workoutSchemes.toArray())));
}

/** null if it doesn't exist (anymore) */
export function useScheme(id: LocalId | null | undefined): WorkoutSchemeWithExercises | null | undefined {
  return useDbQuery(
    async (db) => {
      const scheme = id ? await db.workoutSchemes.get(id) : undefined;
      return scheme ? (await schemesWithExercises(db, [scheme]))[0] : null;
    },
    [id],
  );
}

// MARK: - Users

/** The logged-in user as stored by the sync, null before the first sync loaded it */
export function useCurrentUser(): User | null | undefined {
  return useDbQuery(currentUser);
}

export interface UserSettingsValues {
  /** In kilograms, null until the user set it */
  bodyweight: number | null;
  weightUnit: UnitSystem;
  distanceUnit: UnitSystem;
  /** Hex code like "#FF0000", the default red until the user picked one */
  schemeColor: string;
  /** False until the first sync loaded the current user. The settings can't be changed before. */
  isAvailable: boolean;
}

/** The settings of the current user (UserSettings.swift). Change them with the functions of lib/repo/user.ts. */
export function useUserSettings(): UserSettingsValues | undefined {
  const user = useCurrentUser();
  return useMemo(() => {
    if (user === undefined) return undefined;
    return {
      bodyweight: user?.bodyweight ?? null,
      weightUnit: unitOrMetric(user?.weightUnit),
      distanceUnit: unitOrMetric(user?.distanceUnit),
      schemeColor: user && isHexColor(user.schemeColor) ? user.schemeColor : DEFAULT_SCHEME_COLOR,
      isAvailable: user !== null,
    };
  }, [user]);
}

/** All users the app knows (current user, friends, blocked users, chat members) by server id */
export function useUsersById(): Map<number, User> | undefined {
  return useDbQuery(async (db) => new Map((await db.users.toArray()).map((user) => [user.serverId, user])));
}

/** Sorted by username */
export function useFriends(): User[] | undefined {
  return useDbQuery(async (db) =>
    (await db.users.filter((user) => user.isFriend).toArray()).sort((a, b) => compareNames(a.username, b.username)),
  );
}

/** Sorted by username */
export function useBlockedUsers(): User[] | undefined {
  return useDbQuery(async (db) =>
    (await db.users.filter((user) => user.isBlocked).toArray()).sort((a, b) => compareNames(a.username, b.username)),
  );
}

// MARK: - Chats

/** null if the user isn't a member (anymore) */
export function useChat(chatId: number | null | undefined): ChatWithMembers | null | undefined {
  return useDbQuery(
    async (db) => {
      const chat = chatId == null ? undefined : await db.chats.get(chatId);
      if (!chat) return null;
      return { ...chat, members: await db.chatMembers.where("chatId").equals(chat.serverId).toArray() };
    },
    [chatId],
  );
}

/** The messages of a chat from oldest to newest */
export function useChatMessages(chatId: number | null | undefined): Message[] | undefined {
  return useDbQuery(
    async (db) => (chatId == null ? [] : sortMessages(await db.messages.where("chatId").equals(chatId).toArray())),
    [chatId],
  );
}
