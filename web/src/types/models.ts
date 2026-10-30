// A TypeScript mirror of ios/Gym 2.0/Core/Persistence/Schema/VersionedSchemaV3.swift.
//
// - Unlike SwiftData, IndexedDB needs an explicit primary key: the models that can be changed offline have a local
//   `id` (a random UUID created on this device, never sent to the server). Relationships between them reference this
//   local id, because a row created offline has no serverId yet.
// - Models that only change online (User, Muscle, MuscleGroup, Equipment, Chat, Message) use their serverId as key.

export type UUID = string;

/** The local primary key of the models that can be created offline. A random UUID, never sent to the server. */
export type LocalId = string;

/**
 * State of a local change that still has to be pushed to the server (SyncState in Swift, an Int enum there).
 * - `synced`: matches the server
 * - `created`: only exists locally -> create
 * - `updated`: changed locally -> update
 * - `deleted`: kept for parity with the Swift enum, but never used: like on iOS, deleted rows are removed from the
 *   database right away and only their server id is kept in the `pendingDeletions` table until the server confirmed.
 */
export type SyncState = "synced" | "created" | "updated" | "deleted";

/** Metric or imperial, stored as 0 / 1 like on the server (UnitSystem in UserDTOs.swift). */
export const UnitSystem = { metric: 0, imperial: 1 } as const;
export type UnitSystem = (typeof UnitSystem)[keyof typeof UnitSystem];

/** The values that can be tracked per set (SetMetric in WorkoutExercise+Helpers.swift). */
export const SET_METRICS = ["reps", "weights", "time", "intensity", "distance"] as const;
export type SetMetric = (typeof SET_METRICS)[number];

// MARK: - Users

/**
 * The current user, friends, blocked users and users in the same group chat.
 * Only created online, the settings of the current user can be changed offline: only `synced` and `updated` are used.
 * Primary key: serverId.
 */
export interface User {
  serverId: number;
  syncState: SyncState;

  username: string;
  /** Image hash, empty if the user has none. Served by GET /images/{hash}, see `imageUrl()` in lib/api. */
  profileImageUrl: string;
  profileIconUrl: string;

  /** Only for the current user and friends. ISO 639-1 code, e.g. "en". */
  language: string | null;

  // only for the current user
  email: string | null;
  createdAt: Date | null;
  /** In kilograms, can be changed offline. */
  bodyweight: number | null;
  /** For every user, shown as the border around the profile image. Hex code like "#FF0000". Can be changed offline. */
  schemeColor: string | null;
  /** Can be changed offline. */
  weightUnit: UnitSystem | null;
  /** Can be changed offline. */
  distanceUnit: UnitSystem | null;

  isCurrentUser: boolean;
  isFriend: boolean;
  isBlocked: boolean;
}

// MARK: - Reference data (not creatable or modifiable), primary key: serverId

export interface Muscle {
  serverId: number;
  name: string;
  /** Image hash of the body with the muscle highlighted. */
  imageUrl: string;
}

export interface MuscleGroup {
  serverId: number;
  name: string;
}

export interface Equipment {
  serverId: number;
  name: string;
}

// MARK: - Exercises

/** Verified exercises and the custom exercises of the current user. Can be created and updated offline. */
export interface Exercise {
  id: LocalId;
  serverId: number | null;
  syncState: SyncState;
  /** Sent when creating it, so that a create sent again after a lost response returns the existing object. */
  clientUUID: UUID;

  name: string;
  /** Other names of the exercise, only used by the search and not shown. */
  aliases: string[];
  exerciseDescription: string | null;
  /**
   * Hashes of the uploaded images, e.g. one per keyframe of the movement. Shown in this order, followed by the
   * pending images. Removing one of a custom exercise removes it on the server with the next sync.
   */
  imageUrls: string[];
  /** Images of a custom exercise that were added offline, uploaded together with the exercise. */
  pendingImages: Blob[];

  muscleGroupId: number;
  equipmentId: number;
  primaryMuscleIds: number[];
  secondaryMuscleIds: number[];
  verified: boolean;

  // which values are tracked per set
  tracksReps: boolean;
  tracksWeights: boolean;
  tracksTime: boolean;
  tracksIntensity: boolean;
  tracksDistance: boolean;
}

// MARK: - Workouts

/** Can be created and updated offline. Workouts in progress are synced like finished ones. */
export interface Workout {
  id: LocalId;
  serverId: number | null;
  syncState: SyncState;
  clientUUID: UUID;

  name: string;
  /** When it was started. */
  date: Date;
  /** In minutes. */
  duration: number;
  inProgress: boolean;
}

/** One exercise of a workout with its sets. Can be created and updated offline. */
export interface WorkoutExercise {
  id: LocalId;
  serverId: number | null;
  syncState: SyncState;
  clientUUID: UUID;

  /** Local id of the workout. Deleting the workout deletes its exercises (cascade). */
  workoutId: LocalId;
  /** Local id of the exercise, null if it was deleted (SwiftData nullifies the relationship). */
  exerciseId: LocalId | null;
  unilateral: boolean;
  /** To sort the exercises inside a workout, consecutive from 0. */
  index: number;

  // One value per entry ("set"), null if the metric is not tracked by the exercise. Unilateral exercises have two
  // entries per set (right, left). Weights in kilograms, time in seconds, distance in meters.
  reps: number[] | null;
  weights: number[] | null;
  time: number[] | null;
  intensity: number[] | null;
  distance: number[] | null;
}

// MARK: - Workout schemes

/** A workout template. Can be created and updated offline. */
export interface WorkoutScheme {
  id: LocalId;
  serverId: number | null;
  syncState: SyncState;
  clientUUID: UUID;

  name: string;
  /** When a workout based on this scheme was last started. */
  lastPerformed: Date | null;
}

/** An exercise of a scheme. Has no sync state of its own: the complete list is pushed with the scheme. */
export interface WorkoutSchemeExercise {
  id: LocalId;
  /** Local id of the scheme. Deleting the scheme deletes its exercises (cascade). */
  schemeId: LocalId;
  /** Local id of the exercise, null if it was deleted. */
  exerciseId: LocalId | null;
  index: number;
}

// MARK: - Chats

/** Only created and updated online. Primary key: serverId. */
export interface Chat {
  serverId: number;

  groupChat: boolean;
  /** Always null for direct chats. */
  name: string | null;
  imageUrl: string | null;
  createdAt: Date;
  createdById: number | null;
  isPublic: boolean;

  // for the chat list, so it can be sorted without loading the messages
  latestMessageTimestamp: Date | null;
  latestMessagePreview: string | null;
  latestMessageSenderId: number | null;

  /** Local only: text in the input field, cleared when the server accepted the message. */
  input: string;
  /** Sent with the message and kept for retries, cleared together with input when the server accepted the message. */
  inputUUID: UUID | null;
}

/** Replaced completely on every sync (read_states). Primary key: [chatId, userId]. */
export interface ChatMember {
  /** Server id of the chat. */
  chatId: number;
  userId: number;
  /** The newest message this member has read, 0 if none. */
  lastReadMessageId: number;
  /** Whether the member is an admin of the group, null for direct chats (and members stored before admins existed). */
  admin: boolean | null;
}

/** Only created and updated online, an unsent message stays in Chat.input. Primary key: serverId. */
export interface Message {
  serverId: number;
  /** Server id of the chat. */
  chatId: number;
  /** Null if the sender's account no longer exists. */
  senderId: number | null;
  createdAt: Date;
  /** Null for photo-only messages. */
  content: string | null;
  imageUrl: string | null;
}

// MARK: - Joined views (what SwiftData gives through relationships)

export type WorkoutExerciseWithExercise = WorkoutExercise & { exercise: Exercise | null };

/** A workout with its exercises sorted by index (`workout.workoutExercises` sorted in Swift). */
export type WorkoutWithExercises = Workout & { workoutExercises: WorkoutExerciseWithExercise[] };

/** A scheme with its exercises in order (`workoutScheme.sortedExercises` in Swift), deleted exercises left out. */
export type WorkoutSchemeWithExercises = WorkoutScheme & { exercises: Exercise[] };

export type ChatWithMembers = Chat & { members: ChatMember[] };

/** The reference data by server id, needed to resolve the ids stored on exercises. */
export interface ReferenceData {
  muscles: Map<number, Muscle>;
  muscleGroups: Map<number, MuscleGroup>;
  equipment: Map<number, Equipment>;
}
