// The IndexedDB database of one user (Dexie): the SwiftData container of the iOS app plus what iOS keeps in the
// UserDefaults for the sync. Every user gets an own database (see connection.ts).
//
// IndexedDB can't index booleans or null. Rows whose indexed value is null (e.g. serverId of a row that was never
// pushed) are simply not in that index, so filter booleans like `inProgress` in JS. Change the schema only with a new
// `this.version(n)`.

import Dexie, { type Table } from "dexie";

import type {
  Chat,
  ChatMember,
  Equipment,
  Exercise,
  LocalId,
  Message,
  Muscle,
  MuscleGroup,
  UUID,
  User,
  Workout,
  WorkoutExercise,
  WorkoutScheme,
  WorkoutSchemeExercise,
} from "@/types/models";

// MARK: - Sync bookkeeping (UserDefaults on iOS)

/** The kinds of objects whose deletion is pushed (PendingDeletion.Kind in PendingDeletions.swift) */
export type PendingDeletionKind = "exercise" | "workout" | "workoutExercise" | "workoutScheme";

/**
 * Server id of an object that was deleted locally and still has to be deleted on the server. The row itself is deleted
 * right away, so the UI doesn't have to filter it out. Primary key: [kind, serverId].
 */
export interface PendingDeletion {
  kind: PendingDeletionKind;
  serverId: number;
}

/**
 * A workout scheme a workout was started from, until the server has set its last performed date. Stored by client
 * UUID, since a scheme created offline has no server id yet (PendingSchemePerformances.swift). Primary key: clientUUID.
 */
interface PendingSchemePerformance {
  clientUUID: UUID;
}

/** The types with their own sync time (SyncTime in SyncService.swift) */
export type SyncTimeType = "exercises" | "workoutSchemes" | "workouts" | "chats";
export const SYNC_TIME_TYPES: readonly SyncTimeType[] = ["exercises", "workoutSchemes", "workouts", "chats"];

/** The values of the `meta` table by key */
export interface MetaValues {
  /** The server id of the user the database belongs to */
  userId: number;
  /**
   * When the account the database belongs to was created (`createdAt` of GET /users/me). Ids are reused when the
   * backend database is reset, a database of a former account with the same id is deleted (see `openAccountDb`).
   */
  accountCreatedAt: string;
  /** The sync time the server sent with the last pull, kept as the server sent it to not lose precision */
  "syncTime.exercises": string;
  "syncTime.workoutSchemes": string;
  "syncTime.workouts": string;
  "syncTime.chats": string;
  /** When the last sync finished successfully (SyncService.lastSyncDate) */
  lastSyncDate: Date;
  /** When the last pull finished (SyncService.lastPullDate), a sync started by a local change only pulls after 60 s */
  lastPullDate: Date;
}

export type MetaKey = keyof MetaValues;

/** A key-value pair, the web counterpart of the UserDefaults keys of the sync. Primary key: key. */
interface MetaEntry<Key extends MetaKey = MetaKey> {
  key: Key;
  value: MetaValues[Key];
}

// MARK: - Database

export const DB_NAME_PREFIX = "gym2-user-";

export class GymDB extends Dexie {
  // Users and reference data, by server id
  users!: Table<User, number>;
  muscles!: Table<Muscle, number>;
  muscleGroups!: Table<MuscleGroup, number>;
  equipment!: Table<Equipment, number>;

  // Can be changed offline, by local id
  exercises!: Table<Exercise, LocalId>;
  workouts!: Table<Workout, LocalId>;
  workoutExercises!: Table<WorkoutExercise, LocalId>;
  workoutSchemes!: Table<WorkoutScheme, LocalId>;
  workoutSchemeExercises!: Table<WorkoutSchemeExercise, LocalId>;

  // Chats, by server id (members by [chatId, userId])
  chats!: Table<Chat, number>;
  chatMembers!: Table<ChatMember, [number, number]>;
  messages!: Table<Message, number>;

  // Sync bookkeeping
  pendingDeletions!: Table<PendingDeletion, [PendingDeletionKind, number]>;
  pendingSchemePerformances!: Table<PendingSchemePerformance, UUID>;
  meta!: Table<MetaEntry, MetaKey>;

  constructor(name: string) {
    super(name);
    // The first key is the primary key, the others are indexes. Only indexed properties are listed.
    this.version(1).stores({
      users: "serverId, syncState, username",
      muscles: "serverId, name",
      muscleGroups: "serverId, name",
      equipment: "serverId, name",

      exercises: "id, serverId, clientUUID, syncState, name, muscleGroupId, equipmentId",
      workouts: "id, serverId, clientUUID, syncState, date",
      workoutExercises: "id, serverId, clientUUID, syncState, workoutId, exerciseId, [workoutId+index]",
      workoutSchemes: "id, serverId, clientUUID, syncState, name",
      workoutSchemeExercises: "id, schemeId, exerciseId, [schemeId+index]",

      chats: "serverId, latestMessageTimestamp",
      chatMembers: "[chatId+userId], chatId, userId",
      messages: "serverId, chatId, [chatId+serverId]",

      pendingDeletions: "[kind+serverId], kind",
      pendingSchemePerformances: "clientUUID",
      meta: "key",
    });
  }

  /** The tables that hold the synced data, e.g. for a transaction over everything */
  get dataTables() {
    return [
      this.users,
      this.muscles,
      this.muscleGroups,
      this.equipment,
      this.exercises,
      this.workouts,
      this.workoutExercises,
      this.workoutSchemes,
      this.workoutSchemeExercises,
      this.chats,
      this.chatMembers,
      this.messages,
    ];
  }

  /** The tables of the sync bookkeeping */
  get syncTables() {
    return [this.pendingDeletions, this.pendingSchemePerformances, this.meta];
  }
}
