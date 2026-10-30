// An in-memory backend for the tests of the sync, like backend/app/services. Every method is a vi.fn, so a test can
// check the requests or replace one answer. `server.*` changes the data directly, like another device would.

import { vi } from "vitest";

import { ApiError } from "@/lib/api";
import type {
  ChatDTO,
  ExerciseDTO,
  ExerciseDraft,
  MessageDTO,
  NewWorkout,
  NewWorkoutScheme,
  ProfileUpdate,
  UserDTO,
  WorkoutDTO,
  WorkoutExerciseDTO,
  WorkoutExerciseDraft,
  WorkoutExerciseUpdate,
  WorkoutSchemeDTO,
  WorkoutSchemeUpdate,
  WorkoutUpdate,
} from "@/lib/api";
import type { SyncApi } from "../api";

type Kind = "exercises" | "workouts" | "schemes";

export const notFound = (code: string) => new ApiError("server", { status: 404, code, message: "Not found" });
export const rejected = (status = 422, message = "Invalid") => new ApiError("server", { status, message, code: "ValidationError" });
export const offline = () => new ApiError("transport");
/** The answer of the delta endpoints to a sync time older than 28 days (backend/app/db/queries/sync.py) */
export const syncTimeExpired = () =>
  new ApiError("server", { status: 400, code: "SyncTimeExpiredError", message: "The last sync is more than 28 days ago." });

const clone = <T>(value: T): T => structuredClone(value);

export class FakeServer {
  private tick = 0;
  /** Sync times before this tick are rejected, see `pruneHistory()` */
  private expiredBefore = 0;
  private nextId = 1000;
  exercises = new Map<number, ExerciseDTO>();
  workouts = new Map<number, WorkoutDTO>();
  schemes = new Map<number, WorkoutSchemeDTO>();
  chats = new Map<number, ChatDTO>();
  /** Changes per kind: id → [tick, deleted] */
  private changes: Record<Kind, Map<number, { tick: number; deleted: ExerciseDTO | null | true }>> = {
    exercises: new Map(),
    workouts: new Map(),
    schemes: new Map(),
  };
  me: UserDTO = {
    id: 42,
    username: "agent",
    email: "agent@example.com",
    profileImageUrl: "",
    profileIconUrl: "",
    bodyweight: 80,
    schemeColor: "#FF0000",
    weightUnit: 0,
    distanceUnit: 0,
    language: "en",
    createdAt: "2026-10-01T10:00:00+00:00",
  };
  friends: UserDTO[] = [];
  blocked: UserDTO[] = [];
  otherUsers = new Map<number, UserDTO>();

  constructor() {
    this.addExercise({ name: "Bench Press", verified: true });
    this.addExercise({ name: "Squat", verified: true });
  }

  private now(): string {
    return String(++this.tick);
  }

  private touch(kind: Kind, id: number, deleted: ExerciseDTO | true | null = null) {
    this.changes[kind].set(id, { tick: ++this.tick, deleted });
  }

  private id(): number {
    return this.nextId++;
  }

  // MARK: - Changes of "another device"

  addExercise(fields: Partial<ExerciseDTO> = {}): ExerciseDTO {
    const dto: ExerciseDTO = {
      id: this.id(),
      clientUuid: null,
      name: "Exercise",
      aliases: [],
      description: null,
      imageUrls: [],
      muscleGroupId: 1,
      equipmentId: 1,
      verified: false,
      reps: true,
      weights: true,
      time: false,
      intensity: false,
      distance: false,
      primaryMuscleIds: [1],
      secondaryMuscleIds: [],
      ...fields,
    };
    this.exercises.set(dto.id, dto);
    this.touch("exercises", dto.id);
    return dto;
  }

  changeExercise(id: number, fields: Partial<ExerciseDTO>) {
    this.exercises.set(id, { ...this.exercises.get(id)!, ...fields });
    this.touch("exercises", id);
  }

  removeExercise(id: number) {
    const dto = this.exercises.get(id)!;
    this.exercises.delete(id);
    this.touch("exercises", id, dto);
  }

  changeWorkout(id: number, change: (workout: WorkoutDTO) => void) {
    const workout = this.workouts.get(id)!;
    change(workout);
    this.touch("workouts", id);
  }

  removeWorkout(id: number) {
    this.workouts.delete(id);
    this.touch("workouts", id, true);
  }

  changeScheme(id: number, change: (scheme: WorkoutSchemeDTO) => void) {
    change(this.schemes.get(id)!);
    this.touch("schemes", id);
  }

  removeScheme(id: number) {
    this.schemes.delete(id);
    this.touch("schemes", id, true);
  }

  /**
   * Like the daily prune job of the backend once a client hasn't synced for 28 days: the deleted rows are removed for
   * good, so no delta reports their deletion anymore, and the sync times of before are rejected (`syncTimeExpired`).
   */
  pruneHistory() {
    for (const changes of Object.values(this.changes)) {
      for (const [id, change] of changes) if (change.deleted) changes.delete(id);
    }
    this.expiredBefore = ++this.tick;
  }

  private checkSyncTime(syncTime: string): number {
    const since = Number(syncTime);
    if (!Number.isFinite(since)) throw rejected(422, "Invalid sync time");
    if (since < this.expiredBefore) throw syncTimeExpired();
    return since;
  }

  private changedSince<T>(kind: Kind, syncTime: string, current: Map<number, T>) {
    const since = this.checkSyncTime(syncTime);
    return [...this.changes[kind].entries()]
      .filter(([, change]) => change.tick > since)
      .map(([id, change]) => ({ id, deleted: change.deleted, current: current.get(id) }));
  }

  /** The chat deltas contain no changed chats, only the read states (which also tell which chats still exist) */
  private chatDelta() {
    return {
      chats: [],
      readStates: [...this.chats.values()].map((chat) => ({ chatId: chat.id, members: clone(chat.members) })),
      syncTime: this.now(),
    };
  }

  private workoutOrThrow(id: number): WorkoutDTO {
    const workout = this.workouts.get(id);
    if (!workout) throw notFound("WorkoutNotFoundError");
    return workout;
  }

  private findWorkoutExercise(id: number): [WorkoutDTO, WorkoutExerciseDTO] {
    for (const workout of this.workouts.values()) {
      const exercise = workout.exercises.find((entry) => entry.id === id);
      if (exercise) return [workout, exercise];
    }
    throw notFound("WorkoutExerciseNotFoundError");
  }

  private checkExercise(id: number) {
    if (!this.exercises.has(id)) throw notFound("ExerciseNotFoundError");
  }

  private workoutExerciseFrom(draft: WorkoutExerciseDraft): WorkoutExerciseDTO {
    this.checkExercise(draft.exerciseId);
    return {
      id: this.id(),
      clientUuid: draft.clientUuid,
      exerciseId: draft.exerciseId,
      unilateral: draft.unilateral,
      index: draft.index,
      reps: draft.reps ?? null,
      weights: draft.weights ?? null,
      time: draft.time ?? null,
      intensity: draft.intensity ?? null,
      distance: draft.distance ?? null,
    };
  }

  /** Like the backend: the kept images of the exercise (`draft.imageUrls`, only for updates) followed by the new ones */
  private exerciseFrom(draft: ExerciseDraft, existing: ExerciseDTO | null, images: readonly unknown[] = []): ExerciseDTO {
    const kept = existing ? draft.imageUrls.filter((hash) => existing.imageUrls.includes(hash)) : [];
    const tick = ++this.tick;
    return {
      id: existing?.id ?? this.id(),
      clientUuid: existing ? existing.clientUuid : draft.clientUuid,
      name: draft.name,
      aliases: draft.aliases,
      description: draft.description,
      imageUrls: [...kept, ...images.map((_, index) => `hash-${tick}-${index}`)],
      muscleGroupId: draft.muscleGroupId,
      equipmentId: draft.equipmentId,
      verified: false,
      reps: draft.reps,
      weights: draft.weights,
      time: draft.time,
      intensity: draft.intensity,
      distance: draft.distance,
      primaryMuscleIds: draft.primaryMuscleIds,
      secondaryMuscleIds: draft.secondaryMuscleIds,
    };
  }

  /** Inserts the exercise at its index, like `createWorkoutExercise` of the backend (one change of the batch update) */
  private createWorkoutExercise(workout: WorkoutDTO, draft: WorkoutExerciseDraft) {
    const existing = workout.exercises.find((entry) => draft.clientUuid && entry.clientUuid === draft.clientUuid);
    if (existing) return;
    const dto = this.workoutExerciseFrom(draft);
    // Like the backend (InvalidWorkoutStateError)
    if (draft.index > workout.exercises.length) throw rejected(422, `Index must be between 0 and ${workout.exercises.length}.`);
    dto.index = draft.index;
    for (const entry of workout.exercises) if (entry.index >= dto.index) entry.index += 1;
    workout.exercises.push(dto);
    workout.exercises.sort((a, b) => a.index - b.index);
  }

  /** Like `updateWorkoutExercise` of the backend: an exercise of another workout isn't found */
  private updateWorkoutExercise(workout: WorkoutDTO, id: number, update: WorkoutExerciseUpdate) {
    const exercise = workout.exercises.find((entry) => entry.id === id);
    if (!exercise) throw notFound("WorkoutExerciseNotFoundError");
    if (update.exerciseId !== undefined) this.checkExercise(update.exerciseId);
    if (update.index !== undefined && update.index >= workout.exercises.length) {
      throw rejected(422, `Index must be between 0 and ${workout.exercises.length - 1}.`);
    }
    if (update.index !== undefined && update.index !== exercise.index) {
      const others = workout.exercises.filter((entry) => entry !== exercise).sort((a, b) => a.index - b.index);
      others.splice(Math.min(update.index, others.length), 0, exercise);
      others.forEach((entry, index) => (entry.index = index));
    }
    const { index: _index, ...rest } = update;
    void _index;
    Object.assign(exercise, Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== undefined)));
    workout.exercises.sort((a, b) => a.index - b.index);
  }

  // MARK: - The API

  readonly api: SyncApi = {
    exercises: {
      all: vi.fn(async () => ({ exercises: clone([...this.exercises.values()]), syncTime: this.now() })),
      changes: vi.fn(async (syncTime: string) => {
        const updates = this.changedSince("exercises", syncTime, this.exercises).map(({ id, deleted, current }) =>
          current
            ? { ...clone(current), action: 1 as const }
            : { ...clone(deleted as ExerciseDTO), id, action: 2 as const },
        );
        return { updates, syncTime: this.now() };
      }),
      create: vi.fn(async (draft: ExerciseDraft, images?: readonly unknown[]) => {
        const existing = [...this.exercises.values()].find((entry) => entry.clientUuid === draft.clientUuid);
        if (existing) return clone(existing);
        const dto = this.exerciseFrom(draft, null, images);
        this.exercises.set(dto.id, dto);
        this.touch("exercises", dto.id);
        return clone(dto);
      }),
      update: vi.fn(async (id: number, draft: ExerciseDraft, images?: readonly unknown[]) => {
        const existing = this.exercises.get(id);
        if (!existing) throw notFound("ExerciseNotFoundError");
        const dto = this.exerciseFrom(draft, existing, images);
        this.exercises.set(id, dto);
        this.touch("exercises", id);
        return clone(dto);
      }),
      delete: vi.fn(async (id: number) => {
        const dto = this.exercises.get(id);
        if (!dto) throw notFound("ExerciseNotFoundError");
        const inUse = [...this.workouts.values()].some((workout) => workout.exercises.some((entry) => entry.exerciseId === id));
        if (inUse) throw rejected(409, "The exercise is part of a workout");
        const inScheme = [...this.schemes.values()].some((scheme) => scheme.exercises.some((entry) => entry.exerciseId === id));
        if (inScheme) throw rejected(409, "The exercise is part of a workout scheme");
        this.removeExercise(id);
      }),
      equipment: vi.fn(async () => [
        { id: 1, name: "Barbell" },
        { id: 2, name: "Body" },
      ]),
      muscleGroups: vi.fn(async () => [{ id: 1, name: "Chest" }]),
      muscles: vi.fn(async () => [{ id: 1, name: "Chest", imageUrl: "chest" }]),
    },

    workouts: {
      all: vi.fn(async () => ({ workouts: clone([...this.workouts.values()]), syncTime: this.now() })),
      changes: vi.fn(async (syncTime: string) => {
        const updates = this.changedSince("workouts", syncTime, this.workouts).map(({ id, current }) =>
          current ? { ...clone(current), action: 1 as const } : { id, action: 2 as const },
        );
        return { updates, syncTime: this.now() };
      }),
      create: vi.fn(async (workout: NewWorkout) => {
        const existing = [...this.workouts.values()].find((entry) => entry.clientUuid === workout.clientUuid);
        if (existing) return clone(existing);
        const dto: WorkoutDTO = {
          id: this.id(),
          clientUuid: workout.clientUuid,
          name: workout.name,
          date: workout.date,
          duration: workout.duration,
          inProgress: workout.inProgress,
          exercises: workout.exercises.map((draft) => this.workoutExerciseFrom(draft)),
        };
        this.workouts.set(dto.id, dto);
        this.touch("workouts", dto.id);
        return clone(dto);
      }),
      update: vi.fn(async (id: number, update: WorkoutUpdate) => {
        // Atomic like the backend: the changes are made on a copy, which only replaces the workout if all succeeded
        const workout = clone(this.workoutOrThrow(id));
        const { exerciseChanges = [], ...fields } = update;
        Object.assign(workout, Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)));
        for (const change of exerciseChanges) {
          if (change.op === "create") {
            const { op: _op, ...draft } = change;
            void _op;
            this.createWorkoutExercise(workout, draft);
          } else {
            const { op: _op, id: exerciseId, ...exerciseUpdate } = change;
            void _op;
            this.updateWorkoutExercise(workout, exerciseId, exerciseUpdate);
          }
        }
        this.workouts.set(id, workout);
        this.touch("workouts", id);
        return clone(workout);
      }),
      delete: vi.fn(async (id: number) => {
        this.workoutOrThrow(id);
        this.removeWorkout(id);
      }),
      deleteExercise: vi.fn(async (id: number) => {
        const [workout, exercise] = this.findWorkoutExercise(id);
        workout.exercises = workout.exercises.filter((entry) => entry !== exercise);
        workout.exercises.forEach((entry, index) => (entry.index = index));
        this.touch("workouts", workout.id);
      }),
    },

    schemes: {
      all: vi.fn(async () => ({ schemes: clone([...this.schemes.values()]), syncTime: this.now() })),
      changes: vi.fn(async (syncTime: string) => {
        const updates = this.changedSince("schemes", syncTime, this.schemes).map(({ id, current }) =>
          current ? { ...clone(current), action: 1 as const } : { id, action: 2 as const },
        );
        return { updates, syncTime: this.now() };
      }),
      create: vi.fn(async (scheme: NewWorkoutScheme) => {
        const existing = [...this.schemes.values()].find((entry) => entry.clientUuid === scheme.clientUuid);
        if (existing) return clone(existing);
        scheme.exercises.forEach((entry) => this.checkExercise(entry.exerciseId));
        const dto: WorkoutSchemeDTO = {
          id: this.id(),
          clientUuid: scheme.clientUuid,
          name: scheme.name,
          lastPerformed: null,
          exercises: scheme.exercises.map((entry) => ({ id: this.id(), ...entry })),
        };
        this.schemes.set(dto.id, dto);
        this.touch("schemes", dto.id);
        return clone(dto);
      }),
      update: vi.fn(async (id: number, update: WorkoutSchemeUpdate) => {
        const scheme = this.schemes.get(id);
        if (!scheme) throw notFound("WorkoutSchemeNotFoundError");
        if (update.name !== undefined) scheme.name = update.name;
        if (update.exercises) scheme.exercises = update.exercises.map((entry) => ({ id: this.id(), ...entry }));
        this.touch("schemes", id);
        return clone(scheme);
      }),
      markPerformed: vi.fn(async (id: number) => {
        const scheme = this.schemes.get(id);
        if (!scheme) throw notFound("WorkoutSchemeNotFoundError");
        scheme.lastPerformed = "2026-10-15T12:00:00+00:00";
        this.touch("schemes", id);
        return clone(scheme);
      }),
      delete: vi.fn(async (id: number) => {
        if (!this.schemes.has(id)) throw notFound("WorkoutSchemeNotFoundError");
        this.removeScheme(id);
      }),
    },

    users: {
      me: vi.fn(async () => clone(this.me)),
      user: vi.fn(async (id: number) => {
        const user = this.otherUsers.get(id);
        if (!user) throw notFound("UserNotFoundError");
        return clone(user);
      }),
      updateProfile: vi.fn(async (update: ProfileUpdate) => {
        this.me = { ...this.me, ...Object.fromEntries(Object.entries(update).filter(([, value]) => value !== null)) };
        return { success: true, message: "Updated" };
      }),
    },

    friends: {
      friends: vi.fn(async () => clone(this.friends)),
      blockedUsers: vi.fn(async () => clone(this.blocked)),
    },

    chats: {
      all: vi.fn(async () => ({ chats: clone([...this.chats.values()]), syncTime: this.now() })),
      changes: vi.fn(async (syncTime: string) => {
        this.checkSyncTime(syncTime);
        return this.chatDelta();
      }),
      sendMessage: vi.fn(async (chatId: number, options: { text?: string | null; clientUuid?: string | null }) => {
        const chat = this.chats.get(chatId);
        if (!chat) throw notFound("ChatNotFoundError");
        const message: MessageDTO = {
          id: this.id(),
          chatId,
          senderId: this.me.id,
          createdAt: "2026-10-15T12:00:00+00:00",
          content: options.text ?? null,
          imageUrl: null,
        };
        chat.messages.push(message);
        return clone(message);
      }),
      markRead: vi.fn(async () => {}),
    },
  };
}
