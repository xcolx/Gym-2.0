// The hooks between the local data and the sync engine (the port of SyncService.swift, built separately).
//
// - `requestSync()` is called by every repo function after it changed the database, like the didSave observer of
//   SyncService on iOS (`contextDidSave` → `scheduleSync()`). It must be cheap: the engine debounces it (iOS pushes
//   3 seconds after the last save) and decides whether to pull too.
// - `pushPendingChanges()` uploads the local changes, e.g. before a logout. Resolves to false if
//   some are still not on the server afterwards (offline, or a create the server rejected).
//
// Until a sync engine registers itself (it only runs once the session is confirmed, see `canSync` of lib/auth),
// `requestSync()` does nothing and `pushPendingChanges()` can't push: it resolves to whether the open database has
// nothing to push, so e.g. a logout while offline doesn't delete unpushed changes.

import { getDb } from "@/lib/db";
import { hasUnpushedChanges } from "@/lib/repo/queries";

interface SyncHandlers {
  requestSync: () => void;
  pushPendingChanges: () => Promise<boolean>;
}

const noHandlers: SyncHandlers = {
  requestSync: () => {},
  pushPendingChanges: async () => {
    const db = getDb();
    return !db || !(await hasUnpushedChanges(db));
  },
};

let handlers: SyncHandlers = noHandlers;

/**
 * Called once by the sync engine when it starts. Returns a function that removes the handlers again (e.g. for an
 * effect cleanup or tests).
 */
export function registerSyncHandlers(next: SyncHandlers): () => void {
  handlers = next;
  return () => {
    if (handlers === next) handlers = noHandlers;
  };
}

/** Tells the sync engine that the local data changed. Never throws. */
export function requestSync(): void {
  try {
    handlers.requestSync();
  } catch (error) {
    console.error("Requesting a sync failed", error);
  }
}

/** Uploads the local changes. Resolves to false if some are still not on the server afterwards. */
export async function pushPendingChanges(): Promise<boolean> {
  try {
    return await handlers.pushPendingChanges();
  } catch (error) {
    console.error("Pushing the local changes failed", error);
    return false;
  }
}
