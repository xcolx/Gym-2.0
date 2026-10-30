// Port of ios/Gym 2.0/Core/Services/Sync/DTO+Mapping.swift. Unlike Swift, which mutates the models in place, every
// function is pure: it returns the new rows (keeping the local id of an existing row) and the child rows to put and
// to delete. UUIDs are compared and stored in lowercase.

import type {
  Chat,
  ChatMember,
  Equipment,
  Exercise,
  LocalId,
  Message,
  Muscle,
  MuscleGroup,
  User,
  Workout,
  WorkoutExercise,
  WorkoutScheme,
  WorkoutSchemeExercise,
} from "@/types/models";
import { newUUID } from "@/lib/uuid";
import type {
  ChatDTO,
  ChatMemberDTO,
  EquipmentDTO,
  ExerciseDTO,
  ExerciseDraft,
  MessageDTO,
  MuscleDTO,
  MuscleGroupDTO,
  NewWorkout,
  NewWorkoutScheme,
  ProfileUpdate,
  UserDTO,
  WorkoutDTO,
  WorkoutExerciseDTO,
  WorkoutExerciseDraft,
  WorkoutExerciseUpdate,
  WorkoutSchemeDTO,
  WorkoutSchemeExerciseDraft,
  WorkoutSchemeUpdate,
  WorkoutUpdate,
} from "./dto";

/** Server limits, see backend/app/schemas/workouts.py and workout_schemes.py */
const SERVER_LIMITS = {
  name: 25,
  duration: { min: 0, max: 1440 },
} as const;

/** The server rejects empty names and names longer than 25 characters (it counts code points) */
export function serverName(name: string, fallback: string): string {
  const trimmed = name.trim();
  return Array.from(trimmed === "" ? fallback : trimmed)
    .slice(0, SERVER_LIMITS.name)
    .join("");
}

function clampDuration(duration: number): number {
  return Math.min(Math.max(duration, SERVER_LIMITS.duration.min), SERVER_LIMITS.duration.max);
}

/**
 * The backend sends ISO 8601 dates with a UTC offset, with or without fractional seconds (up to microseconds).
 * Throws for an invalid date, like the custom date decoding of the iOS APIClient.
 */
export function parseServerDate(value: string): Date {
  // Not every browser parses more than 3 fractional digits
  const normalized = value.replace(/(\.\d{3})\d+/, "$1");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid ISO 8601 date: ${value}`);
  return date;
}

export function parseOptionalServerDate(value: string | null | undefined): Date | null {
  return value ? parseServerDate(value) : null;
}

/** Dates are sent as ISO 8601 in UTC, e.g. "2026-10-15T08:30:00.000Z" */
function serverDateString(date: Date): string {
  return date.toISOString();
}

const lowercaseUUID = (uuid: string | null | undefined) => (uuid ? uuid.toLowerCase() : null);

/** Models that can be matched to a DTO */
interface ServerSyncedRow {
  serverId: number | null;
  clientUUID: string;
}

/** By server id first, by client UUID second (a create whose response got lost) (`[ServerSynced].matching` in Swift) */
export function findMatching<Row extends ServerSyncedRow>(
  rows: readonly Row[],
  serverId: number,
  clientUuid: string | null | undefined,
): Row | undefined {
  const uuid = lowercaseUUID(clientUuid);
  return (
    rows.find((row) => row.serverId === serverId) ??
    (uuid ? rows.find((row) => row.serverId === null && row.clientUUID.toLowerCase() === uuid) : undefined)
  );
}

// MARK: - Reference data

export const muscleFromDTO = (dto: MuscleDTO): Muscle => ({ serverId: dto.id, name: dto.name, imageUrl: dto.imageUrl });

export const muscleGroupFromDTO = (dto: MuscleGroupDTO): MuscleGroup => ({ serverId: dto.id, name: dto.name });

export const equipmentFromDTO = (dto: EquipmentDTO): Equipment => ({ serverId: dto.id, name: dto.name });

// MARK: - Exercises

/**
 * The exercise as the server sent it (`Exercise(dto)` and `exercise.apply(dto)`), synced. An existing row keeps its
 * local id and pending images, and its client UUID if the server sent none.
 */
export function exerciseFromDTO(dto: ExerciseDTO, existing?: Exercise | null): Exercise {
  return {
    id: existing?.id ?? newUUID(),
    serverId: dto.id,
    syncState: "synced",
    clientUUID: lowercaseUUID(dto.clientUuid) ?? existing?.clientUUID ?? newUUID(),
    name: dto.name,
    aliases: dto.aliases ?? [],
    exerciseDescription: dto.description,
    imageUrls: dto.imageUrls ?? [],
    pendingImages: existing?.pendingImages ?? [],
    muscleGroupId: dto.muscleGroupId,
    equipmentId: dto.equipmentId,
    primaryMuscleIds: dto.primaryMuscleIds,
    secondaryMuscleIds: dto.secondaryMuscleIds,
    verified: dto.verified,
    tracksReps: dto.reps,
    tracksWeights: dto.weights,
    tracksTime: dto.time,
    tracksIntensity: dto.intensity,
    tracksDistance: dto.distance,
  };
}

/** The fields for creating or updating it. The client UUID is only used by a create. */
export function exerciseDraft(exercise: Exercise): ExerciseDraft {
  return {
    clientUuid: exercise.clientUUID,
    name: exercise.name,
    aliases: exercise.aliases,
    description: exercise.exerciseDescription,
    imageUrls: exercise.imageUrls,
    muscleGroupId: exercise.muscleGroupId,
    equipmentId: exercise.equipmentId,
    primaryMuscleIds: exercise.primaryMuscleIds,
    secondaryMuscleIds: exercise.secondaryMuscleIds,
    reps: exercise.tracksReps,
    weights: exercise.tracksWeights,
    time: exercise.tracksTime,
    intensity: exercise.tracksIntensity,
    distance: exercise.tracksDistance,
  };
}

// MARK: - Workouts

const byIndex = <Row extends { index: number }>(rows: readonly Row[]) => [...rows].sort((a, b) => a.index - b.index);

/** Nil while the exercise has no server id yet (`workoutExercise.draft(index:)`). Without client UUID. */
export function workoutExerciseDraft(
  workoutExercise: WorkoutExercise,
  exercise: Exercise | null | undefined,
  index: number,
): WorkoutExerciseDraft | null {
  if (exercise?.serverId == null) return null;
  return {
    clientUuid: null,
    exerciseId: exercise.serverId,
    unilateral: workoutExercise.unilateral,
    index,
    reps: workoutExercise.reps,
    weights: workoutExercise.weights,
    time: workoutExercise.time,
    intensity: workoutExercise.intensity,
    distance: workoutExercise.distance,
  };
}

/**
 * Replaces all fields, the metrics the exercise doesn't track are left out. Null while the exercise has no server id
 * yet (`workoutExercise.updateRequest(index:)`).
 */
export function workoutExerciseUpdateRequest(
  workoutExercise: WorkoutExercise,
  exercise: Exercise | null | undefined,
  index: number,
): WorkoutExerciseUpdate | null {
  if (exercise?.serverId == null) return null;
  return {
    exerciseId: exercise.serverId,
    unilateral: workoutExercise.unilateral,
    index,
    reps: workoutExercise.reps,
    weights: workoutExercise.weights,
    time: workoutExercise.time,
    intensity: workoutExercise.intensity,
    distance: workoutExercise.distance,
  };
}

/**
 * The create request with all exercises and their client UUIDs. Null while an exercise of the workout has no server
 * id yet (`workout.newWorkoutRequest`). `exercises` are the local exercises by local id.
 */
export function newWorkoutRequest(
  workout: Workout,
  workoutExercises: readonly WorkoutExercise[],
  exercises: ReadonlyMap<LocalId, Exercise>,
): NewWorkout | null {
  const drafts: WorkoutExerciseDraft[] = [];
  for (const [index, workoutExercise] of byIndex(workoutExercises).entries()) {
    const exercise = workoutExercise.exerciseId === null ? null : exercises.get(workoutExercise.exerciseId);
    const draft = workoutExerciseDraft(workoutExercise, exercise, index);
    if (!draft) return null;
    drafts.push({ ...draft, clientUuid: workoutExercise.clientUUID });
  }
  return {
    clientUuid: workout.clientUUID,
    name: serverName(workout.name, "Workout"),
    date: serverDateString(workout.date),
    duration: clampDuration(workout.duration),
    inProgress: workout.inProgress,
    exercises: drafts,
  };
}

/** `workout.updateRequest`: the workout itself, without its exercises */
export function workoutUpdateRequest(workout: Workout): WorkoutUpdate {
  return {
    name: serverName(workout.name, "Workout"),
    date: serverDateString(workout.date),
    duration: clampDuration(workout.duration),
    inProgress: workout.inProgress,
  };
}

/** The workout exercise as the server sent it (`workoutExercise.apply(dto, exercise:)`), synced. */
function workoutExerciseFromDTO(
  dto: WorkoutExerciseDTO,
  workoutId: LocalId,
  exercise: Exercise,
  existing?: WorkoutExercise | null,
): WorkoutExercise {
  return {
    id: existing?.id ?? newUUID(),
    serverId: dto.id,
    syncState: "synced",
    clientUUID: lowercaseUUID(dto.clientUuid) ?? existing?.clientUUID ?? newUUID(),
    workoutId,
    exerciseId: exercise.id,
    unilateral: dto.unilateral,
    index: dto.index,
    // Like on the server, a metric the exercise doesn't track is null
    reps: exercise.tracksReps ? (dto.reps ?? []) : null,
    weights: exercise.tracksWeights ? (dto.weights ?? []) : null,
    time: exercise.tracksTime ? (dto.time ?? []) : null,
    intensity: exercise.tracksIntensity ? (dto.intensity ?? []) : null,
    distance: exercise.tracksDistance ? (dto.distance ?? []) : null,
  };
}

interface AppliedWorkout {
  workout: Workout;
  /** All exercises of the workout as the server has them, to put */
  workoutExercises: WorkoutExercise[];
  /** The local exercises the server doesn't have anymore, to delete */
  deletedWorkoutExerciseIds: LocalId[];
  /** False if an exercise of the server isn't known locally (it is left out) */
  complete: boolean;
}

/**
 * Overwrites the workout and replaces its exercises with the ones of the server (`workout.apply(dto, exercises:)`).
 * `existing` is the local workout (null for a new one) and `existingWorkoutExercises` its exercises.
 * `exercisesByServerId` are the local exercises by server id.
 */
export function applyWorkoutDTO(
  dto: WorkoutDTO,
  existing: Workout | null | undefined,
  existingWorkoutExercises: readonly WorkoutExercise[],
  exercisesByServerId: ReadonlyMap<number, Exercise>,
): AppliedWorkout {
  const workout: Workout = {
    id: existing?.id ?? newUUID(),
    serverId: dto.id,
    syncState: "synced",
    clientUUID: lowercaseUUID(dto.clientUuid) ?? existing?.clientUUID ?? newUUID(),
    name: dto.name,
    date: parseServerDate(dto.date),
    duration: dto.duration,
    inProgress: dto.inProgress,
  };

  let complete = true;
  const remaining = [...existingWorkoutExercises];
  const updated: WorkoutExercise[] = [];
  for (const exerciseDTO of dto.exercises) {
    const exercise = exercisesByServerId.get(exerciseDTO.exerciseId);
    if (!exercise) {
      complete = false;
      continue;
    }
    // Matched by server id first and by client UUID second, like the workout itself
    const match = findMatching(remaining, exerciseDTO.id, exerciseDTO.clientUuid);
    if (match) remaining.splice(remaining.indexOf(match), 1);
    updated.push(workoutExerciseFromDTO(exerciseDTO, workout.id, exercise, match));
  }
  return {
    workout,
    workoutExercises: updated,
    deletedWorkoutExerciseIds: remaining.map((row) => row.id),
    complete,
  };
}

// MARK: - Workout schemes

/** The exercises of a scheme in order, deleted exercises left out (`workoutScheme.sortedExercises`) */
export function sortedSchemeExercises(
  rows: readonly WorkoutSchemeExercise[],
  exercises: ReadonlyMap<LocalId, Exercise>,
): Exercise[] {
  return byIndex(rows).flatMap((row) => (row.exerciseId === null ? [] : (exercises.get(row.exerciseId) ?? [])));
}

function schemeExerciseDrafts(
  rows: readonly WorkoutSchemeExercise[],
  exercises: ReadonlyMap<LocalId, Exercise>,
): WorkoutSchemeExerciseDraft[] | null {
  const drafts: WorkoutSchemeExerciseDraft[] = [];
  for (const [index, exercise] of sortedSchemeExercises(rows, exercises).entries()) {
    if (exercise.serverId === null) return null;
    drafts.push({ exerciseId: exercise.serverId, index });
  }
  return drafts;
}

/** Null while an exercise of the scheme has no server id yet (`workoutScheme.newSchemeRequest`) */
export function newSchemeRequest(
  scheme: WorkoutScheme,
  rows: readonly WorkoutSchemeExercise[],
  exercises: ReadonlyMap<LocalId, Exercise>,
): NewWorkoutScheme | null {
  const drafts = schemeExerciseDrafts(rows, exercises);
  if (!drafts) return null;
  return { clientUuid: scheme.clientUUID, name: serverName(scheme.name, "Workout"), exercises: drafts };
}

/** Replaces the name and the complete exercise list. Null while an exercise has no server id yet. */
export function schemeUpdateRequest(
  scheme: WorkoutScheme,
  rows: readonly WorkoutSchemeExercise[],
  exercises: ReadonlyMap<LocalId, Exercise>,
): WorkoutSchemeUpdate | null {
  const drafts = schemeExerciseDrafts(rows, exercises);
  if (!drafts) return null;
  return { name: serverName(scheme.name, "Workout"), exercises: drafts };
}

interface AppliedScheme {
  scheme: WorkoutScheme;
  /** All exercise rows of the scheme, to put */
  rows: WorkoutSchemeExercise[];
  /** The rows that are too many now, to delete */
  deletedRowIds: LocalId[];
  /** False if an exercise of the server isn't known locally (it is left out) */
  complete: boolean;
}

/**
 * Overwrites the scheme and replaces its exercises with the ones of the server (`workoutScheme.apply(dto, exercises:)`).
 * The existing rows are updated in place, extra rows are deleted from the end.
 */
export function applySchemeDTO(
  dto: WorkoutSchemeDTO,
  existing: WorkoutScheme | null | undefined,
  existingRows: readonly WorkoutSchemeExercise[],
  exercisesByServerId: ReadonlyMap<number, Exercise>,
): AppliedScheme {
  const scheme: WorkoutScheme = {
    id: existing?.id ?? newUUID(),
    serverId: dto.id,
    syncState: "synced",
    clientUUID: lowercaseUUID(dto.clientUuid) ?? existing?.clientUUID ?? newUUID(),
    name: dto.name,
    lastPerformed: parseOptionalServerDate(dto.lastPerformed),
  };

  const matched = byIndex(dto.exercises).flatMap((row) => exercisesByServerId.get(row.exerciseId) ?? []);
  const rows = byIndex(existingRows);
  const deletedRowIds = rows.splice(matched.length).map((row) => row.id);
  const updated = matched.map((exercise, index): WorkoutSchemeExercise => ({
    id: rows[index]?.id ?? newUUID(),
    schemeId: scheme.id,
    exerciseId: exercise.id,
    index,
  }));
  return { scheme, rows: updated, deletedRowIds, complete: matched.length === dto.exercises.length };
}

// MARK: - Users

/**
 * The user as the server sent it (`User(dto)` and `user.apply(dto, includingSettings:)`). `includingSettings` is
 * false while the current user has settings that weren't pushed yet: they are kept then. The flags (isCurrentUser,
 * isFriend, isBlocked) are kept from the existing row, the sync sets them.
 */
export function userFromDTO(dto: UserDTO, existing?: User | null, includingSettings = true): User {
  const base: User = existing ?? {
    serverId: dto.id,
    syncState: "synced",
    username: dto.username,
    profileImageUrl: dto.profileImageUrl,
    profileIconUrl: dto.profileIconUrl,
    language: null,
    email: null,
    createdAt: null,
    bodyweight: null,
    schemeColor: null,
    weightUnit: null,
    distanceUnit: null,
    isCurrentUser: false,
    isFriend: false,
    isBlocked: false,
  };
  const user: User = {
    ...base,
    username: dto.username,
    profileImageUrl: dto.profileImageUrl,
    profileIconUrl: dto.profileIconUrl,
    language: dto.language,
    email: dto.email,
    createdAt: parseOptionalServerDate(dto.createdAt),
  };
  // A new user always takes the settings, there are none to keep
  if (!includingSettings && existing) return user;
  return {
    ...user,
    syncState: "synced",
    bodyweight: dto.bodyweight,
    schemeColor: dto.schemeColor,
    weightUnit: dto.weightUnit,
    distanceUnit: dto.distanceUnit,
  };
}

/** The settings that can be changed offline, only the current user has them (`user.profileUpdate`) */
export function profileUpdate(user: User): ProfileUpdate {
  return {
    bodyweight: user.bodyweight,
    schemeColor: user.schemeColor,
    weightUnit: user.weightUnit,
    distanceUnit: user.distanceUnit,
  };
}

// MARK: - Chats

/**
 * The metadata of the chat as the server sent it (`Chat(dto)` and `chat.apply(dto)`). The members and the messages
 * are synced separately, the local input and its UUID are kept.
 */
export function chatFromDTO(dto: ChatDTO, existing?: Chat | null): Chat {
  return {
    serverId: dto.id,
    groupChat: dto.groupChat,
    name: dto.name,
    imageUrl: dto.imageUrl,
    createdAt: parseServerDate(dto.createdAt),
    createdById: dto.createdBy,
    isPublic: dto.public,
    latestMessageTimestamp: parseOptionalServerDate(dto.latestMessageTimestamp),
    latestMessagePreview: dto.latestMessagePreview,
    latestMessageSenderId: dto.latestMessageSenderId,
    input: existing?.input ?? "",
    inputUUID: existing?.inputUUID ?? null,
  };
}

/** Whether `chatFromDTO` would change anything, so a poll that changed nothing doesn't write (and re-render) */
export function chatChanged(existing: Chat, updated: Chat): boolean {
  return (Object.keys(updated) as (keyof Chat)[]).some((key) => {
    const a = existing[key];
    const b = updated[key];
    if (a instanceof Date && b instanceof Date) return a.getTime() !== b.getTime();
    return a !== b;
  });
}

/**
 * Replaces the members and their read state (`chat.replaceMembers(with:)`). Only what changed is returned: the chats
 * are polled every few seconds, and every write re-renders the views that show the chat.
 */
export function replaceChatMembers(
  chatId: number,
  dtos: readonly ChatMemberDTO[],
  existing: readonly ChatMember[],
): { put: ChatMember[]; deletedUserIds: number[] } {
  const existingByUser = new Map(existing.map((member) => [member.userId, member]));
  const newIds = new Set(dtos.map((dto) => dto.userId));
  const put = dtos
    .filter((dto) => {
      const member = existingByUser.get(dto.userId);
      return member?.lastReadMessageId !== dto.lastReadMessageId || (member.admin ?? null) !== (dto.admin ?? null);
    })
    .map((dto) => ({ chatId, userId: dto.userId, lastReadMessageId: dto.lastReadMessageId, admin: dto.admin ?? null }));
  const deletedUserIds = existing.filter((member) => !newIds.has(member.userId)).map((member) => member.userId);
  return { put, deletedUserIds };
}

/** `Message(dto, chat:)` */
export function messageFromDTO(dto: MessageDTO): Message {
  return {
    serverId: dto.id,
    chatId: dto.chatId,
    senderId: dto.senderId,
    createdAt: parseServerDate(dto.createdAt),
    content: dto.content,
    imageUrl: dto.imageUrl,
  };
}
