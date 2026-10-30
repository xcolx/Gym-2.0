// Only one tab may sync at a time: every sync run holds a lock that is shared by all tabs of the origin. The other
// tabs see the synced data through Dexie's live queries (they observe changes across tabs).
//
// - Web Locks API (`navigator.locks`), released by the browser when the tab closes or crashes.
// - Fallback where it doesn't exist (old browsers, and pages that aren't a secure context, e.g. http://192.168.x.x):
//   a lease in the localStorage that is renewed while it is held and expires if the tab is gone.
// - Without both (e.g. storage blocked): only the runs of this tab are serialized.

import { newUUID } from "@/lib/uuid";

/** Runs `task` while holding the lock, after the runs that requested it before (also of other tabs) */
export type SyncLock = <T>(task: () => Promise<T>) => Promise<T>;

/** Serializes the runs of this tab only */
export function inTabLock(): SyncLock {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>) => {
    const run = tail.then(task, task);
    tail = run.catch(() => undefined);
    return run;
  };
}

interface LocksManager {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

function webLocks(): LocksManager | null {
  if (typeof navigator === "undefined") return null;
  const locks = (navigator as Navigator & { locks?: LocksManager }).locks;
  return locks && typeof locks.request === "function" ? locks : null;
}

/** The lock of the sync of one database, see the comment at the top */
export function createSyncLock(name: string): SyncLock {
  const locks = webLocks();
  const local = inTabLock();
  if (locks) return (task) => local(() => locks.request(name, task));
  const lease = createLeaseLock(name);
  return lease ? (task) => local(() => lease(task)) : local;
}

// MARK: - localStorage lease

const LEASE_MS = 15_000;
const RENEW_MS = 5_000;
const RETRY_MS = 250;
/** Time for another tab that wrote the lease at the same moment to overwrite it, the last writer wins */
const SETTLE_MS = 50;

interface Lease {
  owner: string;
  expires: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type LeaseStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** The fallback lock: a lease in the storage (default: localStorage), null if the storage can't be used */
export function createLeaseLock(name: string, storageOverride?: LeaseStorage): SyncLock | null {
  let storage: LeaseStorage;
  try {
    storage = storageOverride ?? localStorage;
    storage.getItem(name);
  } catch {
    return null;
  }
  const key = `gym2.lock.${name}`;
  const owner = newUUID();
  const read = (): Lease | null => {
    try {
      return JSON.parse(storage.getItem(key) ?? "null") as Lease | null;
    } catch {
      return null;
    }
  };
  const write = () => storage.setItem(key, JSON.stringify({ owner, expires: Date.now() + LEASE_MS }));

  return async <T>(task: () => Promise<T>) => {
    for (;;) {
      const lease = read();
      if (!lease || lease.expires < Date.now() || lease.owner === owner) {
        write();
        await sleep(SETTLE_MS);
        if (read()?.owner === owner) break;
      }
      await sleep(RETRY_MS);
    }
    const renew = setInterval(write, RENEW_MS);
    try {
      return await task();
    } finally {
      clearInterval(renew);
      if (read()?.owner === owner) storage.removeItem(key);
    }
  };
}
