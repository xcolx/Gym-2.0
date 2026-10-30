// Ports of PendingDeletions.swift, PendingSchemePerformances.swift and the SyncTime enum of SyncService.swift. All
// functions work inside a Dexie transaction that includes the tables they use.

import Dexie from "dexie";

import type { UUID } from "@/types/models";
import {
  SYNC_TIME_TYPES,
  type GymDB,
  type MetaKey,
  type MetaValues,
  type PendingDeletion,
  type PendingDeletionKind,
  type SyncTimeType,
} from "./schema";

// MARK: - Meta values

export async function getMeta<Key extends MetaKey>(db: GymDB, key: Key): Promise<MetaValues[Key] | undefined> {
  const entry = await db.meta.get(key);
  return entry?.value as MetaValues[Key] | undefined;
}

export async function setMeta<Key extends MetaKey>(db: GymDB, key: Key, value: MetaValues[Key]): Promise<void> {
  await db.meta.put({ key, value });
}

async function deleteMeta(db: GymDB, key: MetaKey): Promise<void> {
  await db.meta.delete(key);
}

// MARK: - Sync times (SyncTime)

const syncTimeKey = (type: SyncTimeType) => `syncTime.${type}` as const;

export function getSyncTime(db: GymDB, type: SyncTimeType): Promise<string | undefined> {
  return getMeta(db, syncTimeKey(type));
}

export function setSyncTime(db: GymDB, type: SyncTimeType, syncTime: string): Promise<void> {
  return setMeta(db, syncTimeKey(type), syncTime);
}

/** E.g. after the server rejected a change: the next pull of the type loads everything (get_all) */
export function removeSyncTime(db: GymDB, type: SyncTimeType): Promise<void> {
  return deleteMeta(db, syncTimeKey(type));
}

export async function removeAllSyncTimes(db: GymDB): Promise<void> {
  await db.meta.bulkDelete(SYNC_TIME_TYPES.map(syncTimeKey));
}

/** True if a type has no sync time yet, a sync pulls then even if only a push was requested */
export async function isAnySyncTimeMissing(db: GymDB): Promise<boolean> {
  const entries = await db.meta.bulkGet(SYNC_TIME_TYPES.map(syncTimeKey));
  return entries.some((entry) => entry === undefined);
}

// MARK: - Pending deletions (PendingDeletions)

/** Messages to the user name the kind like this (PendingDeletion.Kind.displayName) */
export const PENDING_DELETION_DISPLAY_NAMES: Record<PendingDeletionKind, string> = {
  exercise: "exercise",
  workout: "workout",
  workoutExercise: "exercise of a workout",
  workoutScheme: "workout scheme",
};

/** Records the deletion of a pushed object. Objects that were never pushed (no server id) are only deleted locally. */
export function addPendingDeletion(db: GymDB, kind: PendingDeletionKind, serverId: number | null): Promise<unknown> {
  // Always a Dexie promise: awaiting a native promise that did no database work loses the transaction (see write.ts)
  if (serverId === null) return Dexie.Promise.resolve();
  return db.pendingDeletions.put({ kind, serverId });
}

export function getPendingDeletions(db: GymDB): Promise<PendingDeletion[]> {
  return db.pendingDeletions.toArray();
}

export async function removePendingDeletion(db: GymDB, deletion: PendingDeletion): Promise<void> {
  await db.pendingDeletions.delete([deletion.kind, deletion.serverId]);
}

// MARK: - Pending scheme performances (PendingSchemePerformances)

export async function addPendingSchemePerformance(db: GymDB, clientUUID: UUID): Promise<void> {
  await db.pendingSchemePerformances.put({ clientUUID });
}

export async function getPendingSchemePerformances(db: GymDB): Promise<UUID[]> {
  return (await db.pendingSchemePerformances.toArray()).map((entry) => entry.clientUUID);
}

export async function removePendingSchemePerformance(db: GymDB, clientUUID: UUID): Promise<void> {
  await db.pendingSchemePerformances.delete(clientUUID);
}
