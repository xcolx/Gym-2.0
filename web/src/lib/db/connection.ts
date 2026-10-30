// The web counterpart of CustomContainer.swift. The session (lib/auth/session.ts) opens the database after the login
// and deletes it on logout.

import Dexie from "dexie";

import { createStore, useStore } from "@/lib/store";
import { DB_NAME_PREFIX, GymDB } from "./schema";

type DbState =
  | { status: "closed" }
  | { status: "opening"; userId: number }
  | { status: "open"; userId: number; db: GymDB }
  /** IndexedDB can't be used, e.g. blocked in a private window or by the browser settings. The app can't work then. */
  | { status: "unavailable"; userId: number; message: string };

const dbStore = createStore<DbState>({ status: "closed" });

const STORAGE_UNAVAILABLE_MESSAGE =
  "Gym 2.0 can't store data in this browser, e.g. because it is a private window or storing site data is blocked. " +
  "It needs the storage to keep your workouts on this device and to work offline.";

export function userDbName(userId: number): string {
  return `${DB_NAME_PREFIX}${userId}`;
}

/** Thrown by repo functions when no database is open (no user logged in) */
export class DbNotOpenError extends Error {
  constructor() {
    super("No user is logged in, the local database is not open.");
    this.name = "DbNotOpenError";
  }
}

export function getDb(): GymDB | null {
  const state = dbStore.get();
  return state.status === "open" ? state.db : null;
}

export function requireDb(): GymDB {
  const db = getDb();
  if (!db) throw new DbNotOpenError();
  return db;
}

export function useDb(): GymDB | null {
  const state = useStore(dbStore);
  return state.status === "open" ? state.db : null;
}

export function useDbState(): DbState {
  return useStore(dbStore);
}

let openingPromise: { userId: number; promise: Promise<GymDB | null> } | null = null;

/**
 * Opens the database of the user and makes it the current one, closing the database of another user. Resolves to
 * null (and `dbStore` to "unavailable") if IndexedDB can't be used.
 */
export function openUserDb(userId: number): Promise<GymDB | null> {
  const state = dbStore.get();
  if (state.status === "open" && state.userId === userId) return Promise.resolve(state.db);
  if (openingPromise?.userId === userId) return openingPromise.promise;

  closeUserDb();
  dbStore.set({ status: "opening", userId });
  const promise = (async () => {
    if (typeof indexedDB === "undefined") {
      dbStore.set({ status: "unavailable", userId, message: STORAGE_UNAVAILABLE_MESSAGE });
      return null;
    }
    const db = new GymDB(userDbName(userId));
    try {
      await db.open();
      await db.meta.put({ key: "userId", value: userId });
    } catch (error) {
      console.error("Opening the local database failed", error);
      db.close();
      if (isCurrentOpening(userId)) {
        dbStore.set({ status: "unavailable", userId, message: STORAGE_UNAVAILABLE_MESSAGE });
      }
      return null;
    }
    // Another tab deleted the database (logout there) or upgrades it: close it here, the session store notices the
    // logout through the storage event
    db.on("versionchange", () => {
      db.close();
      const current = dbStore.get();
      if (current.status === "open" && current.db === db) dbStore.set({ status: "closed" });
    });
    if (!isCurrentOpening(userId)) {
      // Another user was opened in the meantime
      db.close();
      return null;
    }
    dbStore.set({ status: "open", userId, db });
    void requestPersistentStorage();
    return db;
  })();
  openingPromise = { userId, promise };
  void promise.finally(() => {
    if (openingPromise?.promise === promise) openingPromise = null;
  });
  return promise;
}

function isCurrentOpening(userId: number): boolean {
  const state = dbStore.get();
  return state.status === "opening" && state.userId === userId;
}

/**
 * Opens the database of the account GET /users/me returned (`openUserDb`) and makes sure it belongs to that account:
 * the database is named by the user id, which a new account gets again when the backend database was reset. A
 * database of a former account is deleted first, otherwise its data would stay (the sync only pulls the changes since
 * its sync times) and its changes would be pushed into the new account. Its unpushed changes are lost, the account
 * doesn't exist anymore. A database without the date (from before it was stored) is taken as the account's, and
 * without `createdAt` nothing is checked.
 */
export async function openAccountDb(account: { id: number; createdAt: string | null }): Promise<GymDB | null> {
  let db = await openUserDb(account.id);
  if (!db || account.createdAt === null) return db;
  const stored = (await db.meta.get("accountCreatedAt"))?.value;
  if (stored !== undefined && stored !== account.createdAt) {
    await deleteUserDb(account.id);
    db = await openUserDb(account.id);
    if (!db) return null;
  }
  if (stored !== account.createdAt) await db.meta.put({ key: "accountCreatedAt", value: account.createdAt });
  return db;
}

/** Closes the current database, the data stays on the device */
export function closeUserDb(): void {
  const state = dbStore.get();
  if (state.status === "open") state.db.close();
  openingPromise = null;
  if (state.status !== "closed") dbStore.set({ status: "closed" });
}

/** Deletes the database of the user with all its data, e.g. on logout. Closes it first if it is open. */
export async function deleteUserDb(userId: number): Promise<void> {
  const state = dbStore.get();
  if (state.status !== "closed" && state.userId === userId) closeUserDb();
  if (typeof indexedDB === "undefined") return;
  try {
    await Dexie.delete(userDbName(userId));
  } catch (error) {
    console.error("Deleting the local database failed", error);
  }
}

let persistRequested = false;

/**
 * Asks the browser once per page load to keep the data even when storage runs low (otherwise IndexedDB is
 * "best effort" and may be evicted). Browsers decide on their own, e.g. Chrome grants it to installed web apps.
 */
async function requestPersistentStorage(): Promise<boolean> {
  if (persistRequested) return false;
  persistRequested = true;
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
