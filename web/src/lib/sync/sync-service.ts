// Port of ios/Gym 2.0/Core/Services/Sync/SyncService.swift. This class only coordinates: it starts, coalesces and
// serializes the runs (lock.ts), decides the order of the push and pull steps and keeps the status. The steps are in
// one module per entity (exercise-sync.ts, workout-sync.ts, ...) and get a `SyncContext` (context.ts).
//
// Requests are never made inside a Dexie transaction: a row is read, sent, and then read again in a transaction that
// writes the response, which also tells whether it was changed or deleted (in any tab) while it was being sent.

import { errorMessage, isApiError } from "@/lib/api";
import { getMeta, isAnySyncTimeMissing, removeAllSyncTimes, setMeta, type GymDB } from "@/lib/db";
import { hasUnpushedChanges } from "@/lib/repo/queries";
import { createStore, type Store } from "@/lib/store";

import { defaultSyncApi, type SyncApi } from "./api";
import { ChatSync } from "./chat-sync";
import { SyncStoppedError, type SyncContext } from "./context";
import { pushDeletions } from "./deletions";
import { ExerciseSync } from "./exercise-sync";
import { pruneImages } from "./images";
import { inTabLock, type SyncLock } from "./lock";
import { logSync } from "./log";
import { pullReferenceData } from "./reference-data-sync";
import { WorkoutSchemeSync } from "./scheme-sync";
import { initialSyncStatus, type SyncStatus } from "./state";
import { UserSync } from "./user-sync";
import { WorkoutSync } from "./workout-sync";

/** Local changes are pushed this long after the last change, so that e.g. typing doesn't send a request per character */
const PUSH_DELAY_MS = 3_000;
/** A sync started by a local change only pulls if the last pull is older than this */
const PULL_INTERVAL_MS = 60_000;

interface SyncServiceOptions {
  db: GymDB;
  api?: SyncApi;
  /** Serializes the sync runs, also across tabs (see lock.ts). Default: only within this instance. */
  lock?: SyncLock;
  store?: Store<SyncStatus>;
  pushDelayMs?: number;
  pullIntervalMs?: number;
}

export class SyncService {
  readonly store: Store<SyncStatus>;
  readonly chatSync: ChatSync;
  readonly userSync: UserSync;

  private readonly db: GymDB;
  private readonly api: SyncApi;
  private readonly lock: SyncLock;
  private readonly pushDelayMs: number;
  private readonly pullIntervalMs: number;

  private readonly context: SyncContext;
  private readonly exerciseSync: ExerciseSync;
  private readonly schemeSync: WorkoutSchemeSync;
  private readonly workoutSync: WorkoutSync;

  private runningSync: Promise<void> | null = null;
  private syncAgain = false;
  /**
   * The pull the requested runs want: null none, otherwise pull if the last pull is older than this (ms, -1 always).
   * Decided under the lock, with the date of the last pull in the database, which the tabs share.
   */
  private pullIfOlderThanMs: number | null = null;
  private fullPullRequested = false;
  private scheduledSync: ReturnType<typeof setTimeout> | null = null;
  private lastPullDate: Date | null = null;
  private stopped = false;
  /** Set by a 401 (the session ended) or a 410 (update required): nothing is sent until the engine is started again */
  private haltReason: "unauthorized" | "updateRequired" | null = null;

  private runningChatPush: Promise<void> | null = null;
  private pushChatsAgain = false;
  private runningChatSync: Promise<void> | null = null;

  constructor(options: SyncServiceOptions) {
    this.db = options.db;
    this.api = options.api ?? defaultSyncApi;
    this.lock = options.lock ?? inTabLock();
    this.store = options.store ?? createStore(initialSyncStatus());
    this.pushDelayMs = options.pushDelayMs ?? PUSH_DELAY_MS;
    this.pullIntervalMs = options.pullIntervalMs ?? PULL_INTERVAL_MS;
    this.chatSync = new ChatSync(this.db, this.api);
    this.userSync = new UserSync(this.db, this.api);
    const db = this.db;
    this.context = {
      db,
      api: this.api,
      ensureRunning: () => this.ensureRunning(),
      transaction: (change) => db.transaction("rw", [...db.dataTables, ...db.syncTables], change),
      report: (message) => this.report(message),
      status: () => this.store.get(),
      setStatus: (change) => this.setStatus(change),
      syncAgain: () => {
        this.syncAgain = true;
      },
    };
    this.exerciseSync = new ExerciseSync(this.context);
    this.schemeSync = new WorkoutSchemeSync(this.context);
    this.workoutSync = new WorkoutSync(this.context);
  }

  /** Reads the dates of the last sync of this database */
  async loadDates(): Promise<void> {
    try {
      const [lastSyncDate, lastPullDate] = await Promise.all([
        getMeta(this.db, "lastSyncDate"),
        getMeta(this.db, "lastPullDate"),
      ]);
      this.lastPullDate = lastPullDate ?? null;
      this.setStatus((status) => ({ ...status, lastSyncDate: lastSyncDate ?? null }));
    } catch (error) {
      logSync.error("Reading the dates of the last sync failed", error);
    }
  }

  /** Ends the running sync after its current request and ignores every later call */
  stop(): void {
    this.stopped = true;
    if (this.scheduledSync) clearTimeout(this.scheduledSync);
    this.scheduledSync = null;
  }

  get database(): GymDB {
    return this.db;
  }

  get isStopped(): boolean {
    return this.stopped;
  }

  /** Why the sync doesn't run anymore until it's started again, null while it runs */
  get halted(): "unauthorized" | "updateRequired" | null {
    return this.haltReason;
  }

  // MARK: - Starting a sync

  /**
   * Pushes the local changes and pulls the changes of the server. If a sync is already running, it runs once more
   * afterwards. Resolves when everything is done.
   */
  sync(): Promise<void> {
    return this.run(true);
  }

  /**
   * For when something got out of sync: pushes all local changes first and then loads everything from the server
   * again (the full lists instead of the deltas). The local objects with changes the server rejected stay as they are.
   * If the push fails (e.g. offline), nothing is pulled and `state` is "failed".
   */
  resync(): Promise<void> {
    this.fullPullRequested = true;
    return this.run(true);
  }

  /** Whether there are local changes the next sync would push */
  async hasUnpushedChanges(): Promise<boolean> {
    try {
      return await hasUnpushedChanges(this.db);
    } catch {
      return true;
    }
  }

  /**
   * Pushes the local changes, e.g. before a logout. Resolves to false if some are still not on the server afterwards
   * (offline, or a create the server rejected).
   */
  async pushPendingChanges(): Promise<boolean> {
    if (!(await this.hasUnpushedChanges())) return true;
    await this.run(false);
    return !(await this.hasUnpushedChanges());
  }

  /** Syncs a moment after the last call, used after local changes. Pulls only if the last pull is a minute ago. */
  scheduleSync(): void {
    if (this.stopped) return;
    if (this.scheduledSync) clearTimeout(this.scheduledSync);
    this.scheduledSync = setTimeout(() => {
      this.scheduledSync = null;
      void this.run({ ifOlderThanMs: this.pullIntervalMs });
    }, this.pushDelayMs);
  }

  /** Starts a scheduled sync right away, e.g. when the page is hidden and may be frozen soon */
  flushScheduledSync(): void {
    if (!this.scheduledSync) return;
    clearTimeout(this.scheduledSync);
    this.scheduledSync = null;
    void this.run({ ifOlderThanMs: this.pullIntervalMs });
  }

  get hasScheduledSync(): boolean {
    return this.scheduledSync !== null;
  }

  /**
   * Whether the last pull (of any tab: the date is read from the database) is older than `intervalMs` or there was
   * none. Called under the lock, so a tab that waited for another tab's sync sees that pull.
   */
  private async isPullDue(intervalMs: number): Promise<boolean> {
    if (intervalMs < 0) return true;
    try {
      this.lastPullDate = (await getMeta(this.db, "lastPullDate")) ?? null;
    } catch (error) {
      logSync.error("Reading the date of the last pull failed", error);
    }
    return this.lastPullDate === null || Date.now() - this.lastPullDate.getTime() > intervalMs;
  }

  /**
   * After every local change (`requestSync()` of lib/sync/registry, the didSave observer on iOS): schedules a sync
   * and sends the queued chat messages right away (`SyncService.sendMessage`).
   */
  requestSync(): void {
    if (this.stopped) return;
    this.scheduleSync();
    void this.pushChatMessages();
  }

  /**
   * Pushes, then pulls if `pull` is true, or if the last pull is older than `ifOlderThanMs` when the sync gets the lock
   * (or a type was never pulled). Coalesces with a running sync like iOS.
   */
  run(pull: boolean | { ifOlderThanMs: number }): Promise<void> {
    if (this.stopped || this.haltReason) return Promise.resolve();
    const maxAge = pull === true ? -1 : pull === false ? null : pull.ifOlderThanMs;
    if (maxAge !== null) {
      this.pullIfOlderThanMs = this.pullIfOlderThanMs === null ? maxAge : Math.min(this.pullIfOlderThanMs, maxAge);
    }
    if (this.runningSync) {
      this.syncAgain = true;
      return this.runningSync;
    }
    const task = (async () => {
      try {
        do {
          this.syncAgain = false;
          const pullAge = this.pullIfOlderThanMs;
          const fullPull = this.fullPullRequested;
          this.pullIfOlderThanMs = null;
          this.fullPullRequested = false;
          try {
            await this.lock(async () =>
              this.syncOnce(pullAge !== null && !this.stopped && (await this.isPullDue(pullAge)), fullPull),
            );
          } catch (error) {
            logSync.error("Waiting for the sync lock failed", error);
          }
        } while (this.syncAgain && !this.stopped && !this.haltReason);
      } finally {
        // Cleared in the task, so that a sync requested from now on starts a new one instead of waiting for this one
        this.runningSync = null;
      }
    })();
    this.runningSync = task;
    return task;
  }

  // MARK: - Chats

  /**
   * Sends the queued chat messages (`queueChatInput`) right away. If the server can't be reached, they stay queued
   * and are sent with the next sync or poll. Failures are only logged.
   */
  pushChatMessages(): Promise<void> {
    if (this.stopped || this.haltReason) return Promise.resolve();
    return this.sendQueuedMessages().catch((error) => this.handleBackgroundError("Sending the chat messages failed", error));
  }

  /**
   * The only path that sends queued messages (the requests after a local change, the polls and the syncs), so a
   * message is never sent twice at the same time by this tab. A call while messages are being sent waits for them
   * and lets them be checked once more afterwards. Rejects if sending failed (e.g. offline).
   */
  private sendQueuedMessages(): Promise<void> {
    if (this.runningChatPush) {
      this.pushChatsAgain = true;
      return this.runningChatPush;
    }
    const task = (async () => {
      try {
        do {
          this.pushChatsAgain = false;
          if (this.stopped || this.haltReason) return;
          if (!(await this.chatSync.hasQueuedMessages())) continue;
          (await this.chatSync.pushMessages()).forEach((message) => this.report(message));
        } while (this.pushChatsAgain);
      } finally {
        this.runningChatPush = null;
      }
    })();
    this.runningChatPush = task;
    return task;
  }

  /**
   * Only the chats and their new members, e.g. to poll for new messages while a chat is open. There are no push
   * updates yet. Failures are only logged. A poll while one is running waits for it.
   */
  syncChats(): Promise<void> {
    if (this.stopped || this.haltReason) return Promise.resolve();
    if (this.runningChatSync) return this.runningChatSync;
    const task = this.lock(async () => {
      if (this.stopped) return;
      try {
        await this.sendQueuedMessages();
        await this.chatSync.pull();
        // Under the lock no full sync runs at the same time, so the new members can be loaded
        await this.userSync.loadMissingMembers();
      } catch (error) {
        this.handleBackgroundError("Syncing the chats failed", error);
      }
    })
      .catch((error) => logSync.error("Waiting for the sync lock failed", error))
      .finally(() => {
        if (this.runningChatSync === task) this.runningChatSync = null;
      });
    this.runningChatSync = task;
    return task;
  }

  /**
   * Loads the profiles of the members of a chat again and whether they are friends, e.g. regularly while the chat is
   * open (the chat polls don't, the backend has no delta for users). Failures are only logged.
   */
  refreshChatMembers(chatId: number): Promise<void> {
    if (this.stopped || this.haltReason) return Promise.resolve();
    // Under the lock, so that a full sync doesn't store the users at the same time
    return this.lock(async () => {
      if (this.stopped) return;
      try {
        await this.userSync.refreshMembers(chatId);
      } catch (error) {
        this.handleBackgroundError(`Loading the members of the chat ${chatId} failed`, error);
      }
    }).catch((error) => logSync.error("Waiting for the sync lock failed", error));
  }

  /** Stores a chat the server returned after creating, changing or joining it, and loads its members */
  async storeChat(dto: Parameters<ChatSync["store"]>[0]): Promise<void> {
    try {
      await this.chatSync.store(dto);
      if (!this.runningSync) await this.userSync.loadMissingMembers();
    } catch (error) {
      this.handleBackgroundError(`Storing the chat ${dto.id} failed`, error);
    }
  }

  private handleBackgroundError(message: string, error: unknown): void {
    if (isApiError(error) && (error.kind === "unauthorized" || error.kind === "updateRequired")) {
      this.haltReason = error.kind;
    }
    if (!this.stopped) logSync.error(`${message}: ${errorMessage(error)}`);
  }

  // MARK: - Rejected changes

  /** Called after the user has seen the rejected changes */
  dismissRejectedChanges(): void {
    this.setStatus((status) => (status.rejectedChanges.length === 0 ? status : { ...status, rejectedChanges: [] }));
  }

  /** A stopped service doesn't change the state anymore, the store may belong to the next one already */
  private setStatus(change: (status: SyncStatus) => SyncStatus): void {
    if (!this.stopped) this.store.set(change);
  }

  private report(message: string): void {
    this.setStatus((status) =>
      status.rejectedChanges.includes(message) ? status : { ...status, rejectedChanges: [...status.rejectedChanges, message] },
    );
  }

  // MARK: - Sync

  private ensureRunning(): void {
    if (this.stopped) throw new SyncStoppedError();
  }

  private async syncOnce(pull: boolean, fullPull: boolean): Promise<void> {
    if (this.stopped || this.haltReason) return;
    this.setStatus((status) => ({ ...status, state: "syncing" }));
    logSync.info(`Sync started (pull: ${pull}, full pull: ${fullPull})`);
    try {
      // Deletions first, so that the indexes of the workout exercises on the server match the local ones.
      // Exercises are deleted after the workouts and the schemes were pushed, the server keeps exercises that are part
      // of a workout or a scheme, e.g. one that was removed from a scheme right before it was deleted.
      await pushDeletions(this.context, ["workoutExercise", "workout", "workoutScheme"]);
      await this.exerciseSync.push();
      await this.schemeSync.push();
      await pushDeletions(this.context, ["exercise"]);
      await this.schemeSync.pushPerformances();
      await this.workoutSync.push();
      // The ones recorded because they were deleted while they were being created
      await pushDeletions(this.context, ["workoutExercise", "workout", "workoutScheme", "exercise"]);
      this.ensureRunning();
      const rejectedSettings = await this.userSync.pushSettings();
      if (rejectedSettings) this.report(rejectedSettings);
      this.ensureRunning();
      await this.sendQueuedMessages();

      // Only after the push succeeded, so that everything that is pulled already contains the local changes
      if (fullPull) await removeAllSyncTimes(this.db);

      // A sync time is removed when the server rejected a change, the full pull then restores the server's version
      const pullNow = pull || (await isAnySyncTimeMissing(this.db));
      if (pullNow) {
        this.ensureRunning();
        await pullReferenceData(this.context);
        this.ensureRunning();
        await this.exerciseSync.pull();
        this.ensureRunning();
        await this.schemeSync.pull();
        this.ensureRunning();
        await this.workoutSync.pull();
        this.ensureRunning();
        // The users after the chats, the members of new chats are loaded with them
        await this.chatSync.pull();
        this.ensureRunning();
        await this.userSync.pull();
        this.lastPullDate = new Date();
        await setMeta(this.db, "lastPullDate", this.lastPullDate);
        await pruneImages(this.db);
      } else if (rejectedSettings) {
        // The rejected settings are replaced by the server's now, not only by the next pull
        this.ensureRunning();
        await this.userSync.pullCurrentUser();
      }

      const lastSyncDate = new Date();
      await setMeta(this.db, "lastSyncDate", lastSyncDate);
      this.setStatus((status) => ({ ...status, state: "idle", failureMessage: null, failureDate: null, lastSyncDate }));
      logSync.info("Sync finished");
    } catch (error) {
      if (this.stopped || error instanceof SyncStoppedError) {
        logSync.info("Sync stopped");
        return;
      }
      if (isApiError(error) && error.kind === "unauthorized") {
        // The session store shows the login again, the changes are pushed after the next login
        logSync.info("Sync stopped, the session ended");
        this.haltReason = "unauthorized";
        this.setStatus((status) => ({ ...status, state: "idle" }));
      } else {
        if (isApiError(error) && error.kind === "updateRequired") {
          // The app only shows the update screen, the local changes are kept for after the update
          this.haltReason = "updateRequired";
        }
        logSync.error(`Sync failed: ${errorMessage(error)}`, error);
        const message = errorMessage(error);
        this.setStatus((status) => ({ ...status, state: "failed", failureMessage: message, failureDate: new Date() }));
      }
    }
    await this.removeResolvedCreates();
  }

  /** Removes the rejected creates that were saved in the meantime or deleted locally */
  private async removeResolvedCreates(): Promise<void> {
    if (this.stopped || Object.keys(this.store.get().rejectedCreates).length === 0) return;
    try {
      const unsaved = new Set<string>();
      const add = (row: { serverId: number | null; clientUUID: string }) => {
        if (row.serverId === null) unsaved.add(row.clientUUID.toLowerCase());
      };
      (await this.db.exercises.toArray()).forEach(add);
      (await this.db.workoutSchemes.toArray()).forEach(add);
      (await this.db.workouts.toArray()).forEach(add);
      this.setStatus((status) => {
        const kept = Object.entries(status.rejectedCreates).filter(([uuid]) => unsaved.has(uuid));
        if (kept.length === Object.keys(status.rejectedCreates).length) return status;
        return { ...status, rejectedCreates: Object.fromEntries(kept) };
      });
    } catch (error) {
      logSync.error("Checking the rejected creates failed", error);
    }
  }
}
