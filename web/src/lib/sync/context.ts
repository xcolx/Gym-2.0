import { isApiError, isRejection } from "@/lib/api";
import type { GymDB } from "@/lib/db";
import type { Exercise } from "@/types/models";
import type { SyncApi } from "./api";
import type { SyncStatus } from "./state";

export interface SyncContext {
  readonly db: GymDB;
  readonly api: SyncApi;
  /** Throws `SyncStoppedError` once the service was stopped. Called before every request of a push. */
  ensureRunning(): void;
  /** One transaction over all tables: the sync writes what it received at once */
  transaction<T>(change: () => Promise<T>): Promise<T>;
  /** Lists a message in `rejectedChanges` (once) */
  report(message: string): void;
  status(): SyncStatus;
  /** Does nothing once the service was stopped, the store may belong to the next one already */
  setStatus(change: (status: SyncStatus) => SyncStatus): void;
  /** Lets the running sync run once more after this run */
  syncAgain(): void;
}

/** Thrown inside a running sync after `stop()`, ends it quietly */
export class SyncStoppedError extends Error {
  constructor() {
    super("The sync was stopped.");
    this.name = "SyncStoppedError";
  }
}

export const sameJSON = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The delta since the sync time, null if the server rejected it (e.g. a sync time it doesn't accept anymore) */
export async function loadDelta<Delta>(load: () => Promise<Delta>): Promise<Delta | null> {
  try {
    return await load();
  } catch (error) {
    if (!isRejection(error)) throw error;
    return null;
  }
}

/** The local exercises by server id, the first one wins (inside or outside a transaction) */
export async function exercisesByServerId(db: GymDB): Promise<Map<number, Exercise>> {
  const map = new Map<number, Exercise>();
  for (const exercise of await db.exercises.toArray()) {
    if (exercise.serverId !== null && !map.has(exercise.serverId)) map.set(exercise.serverId, exercise);
  }
  return map;
}

/** The backend's 404 for an exercise a request referenced (e.g. deleted on another device) */
export function isExerciseNotFound(error: unknown): boolean {
  return isApiError(error) && error.kind === "server" && error.status === 404 && error.code === "ExerciseNotFoundError";
}
