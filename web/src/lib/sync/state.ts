// The observable state of the sync (the @Observable properties of SyncService.swift)

import { useMemo } from "react";

import { createStore, useStore, type Store } from "@/lib/store";

/** Something that is out of sync right now (SyncService.Problem) */
export interface SyncProblem {
  id: string;
  title: string;
  message: string;
  date: Date;
}

/**
 * - `idle`: no sync is running (the last one succeeded, or the session ended)
 * - `failed`: the last sync stopped (e.g. offline). The local changes are kept and pushed by the next sync.
 */
export type SyncRunState = "idle" | "syncing" | "failed";

export interface SyncStatus {
  state: SyncRunState;
  /** The message of the failed sync, null unless `state` is "failed" */
  failureMessage: string | null;
  /** When the last sync failed, null once a sync succeeded */
  failureDate: Date | null;
  /** When the last sync finished successfully */
  lastSyncDate: Date | null;
  /** The changes the server rejected, as messages to show. Kept until `dismissRejectedChanges()` is called. */
  rejectedChanges: readonly string[];
  /**
   * The creates the server rejected, by client UUID. They're sent again with every sync and removed once they're
   * saved or deleted locally.
   */
  rejectedCreates: Readonly<Record<string, SyncProblem>>;
  /**
   * The workouts that can't be pushed (completely) because one of their exercises could not be saved, by client UUID
   * of the workout. Replaced by every push of the workouts.
   */
  blockedWorkouts: Readonly<Record<string, SyncProblem>>;
}

export function initialSyncStatus(): SyncStatus {
  return {
    state: "idle",
    failureMessage: null,
    failureDate: null,
    lastSyncDate: null,
    rejectedChanges: [],
    rejectedCreates: {},
    blockedWorkouts: {},
  };
}

const SYNC_FAILED_PROBLEM_ID = "syncFailed";

/** The current problems, newest first, a failed sync on top (`SyncService.problems`) */
export function syncProblems(status: SyncStatus, now: Date = new Date()): SyncProblem[] {
  const problems = [...Object.values(status.rejectedCreates), ...Object.values(status.blockedWorkouts)].sort(
    (a, b) => b.date.getTime() - a.date.getTime(),
  );
  if (status.state === "failed") {
    problems.unshift({
      id: SYNC_FAILED_PROBLEM_ID,
      title: "Sync failed",
      message: `${status.failureMessage ?? "Something went wrong."}\n\nYour changes are kept on this device and uploaded with the next sync.`,
      date: status.failureDate ?? now,
    });
  }
  return problems;
}

/** The state of the running sync engine. Reset when the engine stops (logout, another user). */
export const syncStore: Store<SyncStatus> = createStore<SyncStatus>(initialSyncStatus());

/** The whole sync state: `state` (idle/syncing/failed), `lastSyncDate`, `rejectedChanges`, ... */
export function useSyncState(): SyncStatus {
  return useStore(syncStore);
}

/** What is out of sync right now, newest first (SyncProblemsView, the count in the settings) */
export function useSyncProblems(): SyncProblem[] {
  const status = useSyncState();
  return useMemo(() => syncProblems(status), [status]);
}

/** The messages of the changes the server rejected, until `dismissRejectedChanges()` */
export function useRejectedChanges(): readonly string[] {
  return useSyncState().rejectedChanges;
}
