import type { Table } from "dexie";

import { requireDb, type GymDB } from "@/lib/db";
import { requestSync } from "@/lib/sync/registry";
import type { SyncState } from "@/types/models";

/**
 * Runs `change` in one read-write transaction over the tables (all are rolled back if it throws) on the database of
 * the current user, and calls `requestSync()` after the commit, like a save of the SwiftData context starts a sync on
 * iOS.
 *
 * Inside the transaction only await Dexie promises, or async helpers that await a Dexie call before they return.
 * Awaiting anything else (fetch, timers, or an async function that returns without touching the database) loses
 * Dexie's transaction zone: the following calls run outside of it and Dexie throws a PrematureCommitError. A helper
 * that may skip all database work returns `Dexie.Promise.resolve()` instead of being `async` (see addPendingDeletion).
 */
export async function write<T>(
  tables: (db: GymDB) => Table[],
  change: (db: GymDB) => Promise<T>,
  options: { sync?: boolean } = {},
): Promise<T> {
  const db = requireDb();
  const result = await db.transaction("rw", tables(db), () => change(db));
  if (options.sync ?? true) requestSync();
  return result;
}

/** Marks a synced row as changed, so the next sync pushes it. A row that was never pushed stays `created`. */
export function changedState(syncState: SyncState): SyncState {
  return syncState === "synced" ? "updated" : syncState;
}

/** Thrown when a repo function gets the id of a row that doesn't exist (anymore), e.g. deleted by a sync */
export class NotFoundError extends Error {
  constructor(what: string, id: string | number) {
    super(`The ${what} ${id} doesn't exist (anymore).`);
    this.name = "NotFoundError";
  }
}

export async function getOrThrow<Row, Key extends string | number>(table: Table<Row, Key>, id: Key, what: string): Promise<Row> {
  const row = await table.get(id);
  if (row === undefined) throw new NotFoundError(what, id);
  return row;
}
