// When it syncs:
// - when it starts (after the login or a reload) and when the page becomes visible or the browser goes online again
//   (pulling only if the last pull is older than FOREGROUND_PULL_INTERVAL_MS, tabs are switched more often than apps)
// - 3 s after every local change (`requestSync()`), pulling only if the last pull is older than 60 s
// - every 5 minutes while the page is visible (the web app may stay in the foreground for hours)
// - right away when the page is hidden while a sync is scheduled, the browser may freeze the page soon after
//
// Every tab runs its own engine, the sync runs hold a lock shared by all tabs (lock.ts), so only one tab syncs at a
// time. A 401 (session ended) or 410 (update required) stops the syncing until the engine is started again.

import type { ChatDTO, ImageUpload } from "@/lib/api";
import { sessionStore } from "@/lib/auth/session";
import { DbNotOpenError, requireDb, type GymDB } from "@/lib/db";
import { queueChatInput, storeChat } from "@/lib/repo/chats";
import { currentUser } from "@/lib/repo/queries";
import type { Chat } from "@/types/models";
import type { SyncApi } from "./api";
import { createSyncLock, type SyncLock } from "./lock";
import { logSync } from "./log";
import { registerSyncHandlers } from "./registry";
import { initialSyncStatus, syncStore } from "./state";
import { SyncService } from "./sync-service";

/** A sync started by the page becoming visible or online only pulls if the last pull is older than this */
const FOREGROUND_PULL_INTERVAL_MS = 15_000;
/** While the page is visible it syncs this often */
const PERIODIC_SYNC_INTERVAL_MS = 5 * 60_000;

/** The running sync service, null while no user is logged in */
let current: SyncService | null = null;

const isVisible = () => typeof document === "undefined" || document.visibilityState === "visible";

interface StartSyncOptions {
  api?: SyncApi;
  lock?: SyncLock;
  /** For tests, see SyncServiceOptions */
  pushDelayMs?: number;
}

/**
 * Starts syncing the database: registers the sync handlers, listens for the page becoming visible and the browser
 * going online, and syncs right away. Returns the function that stops it again (an effect cleanup).
 */
export function startSyncEngine(db: GymDB, options: StartSyncOptions = {}): () => void {
  current?.stop();
  syncStore.set(initialSyncStatus());
  const service = new SyncService({
    db,
    api: options.api,
    lock: options.lock ?? createSyncLock(`gym2-sync-${db.name}`),
    store: syncStore,
    pushDelayMs: options.pushDelayMs,
  });
  current = service;

  const unregister = registerSyncHandlers({
    requestSync: () => service.requestSync(),
    pushPendingChanges: () => service.pushPendingChanges(),
  });

  // Whether to pull is decided under the lock: another tab may have pulled on the same trigger right before
  const foregroundSync = () => void service.run({ ifOlderThanMs: FOREGROUND_PULL_INTERVAL_MS });
  const onVisibilityChange = () => {
    if (isVisible()) foregroundSync();
    else service.flushScheduledSync();
  };
  const hasWindow = typeof window !== "undefined";
  if (hasWindow) {
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", foregroundSync);
  }
  const periodic = setInterval(() => {
    if (isVisible()) void service.sync();
  }, PERIODIC_SYNC_INTERVAL_MS);

  void service.loadDates().then(() => service.sync());

  return () => {
    if (hasWindow) {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", foregroundSync);
    }
    clearInterval(periodic);
    unregister();
    service.stop();
    if (current === service) {
      current = null;
      syncStore.set(initialSyncStatus());
    }
  };
}

// MARK: - For the features

/**
 * Pushes the local changes and pulls the changes of the server (pull to refresh, "Sync Again"). If a sync is
 * already running, it runs once more afterwards. Resolves when everything is done, also if it failed: see
 * `useSyncState()`.
 */
export function sync(): Promise<void> {
  return current?.sync() ?? Promise.resolve();
}

/**
 * "Manual Resync": pushes all local changes and then loads everything from the server again. If the push fails,
 * nothing is pulled and the state is "failed".
 */
export function resync(): Promise<void> {
  return current?.resync() ?? Promise.resolve();
}

/** Only the chats and their new members (polling), see `useChatPolling` */
export function syncChats(): Promise<void> {
  return current?.syncChats() ?? Promise.resolve();
}

/** The profiles of the members of an open chat and whether they are friends, see `useChatMembersRefresh` */
export function refreshChatMembers(chatId: number): Promise<void> {
  return current?.refreshChatMembers(chatId) ?? Promise.resolve();
}

/** Called after the user has seen the rejected changes (the "Not saved" alert) */
export function dismissRejectedChanges(): void {
  if (current) current.dismissRejectedChanges();
  else syncStore.set((status) => ({ ...status, rejectedChanges: [] }));
}

function requireService(): SyncService {
  if (!current) throw new DbNotOpenError();
  return current;
}

/**
 * Sends the text in the input field of the chat (`SyncService.sendMessage(in:)`): queues it with a UUID
 * (`queueChatInput`) and sends it right away. If the server can't be reached, it stays queued and is sent with the
 * next sync or poll; a message the server rejects stays in `input` without its UUID and is reported in
 * `rejectedChanges` (the "Not saved" alert). Resolves when it was tried, with the chat afterwards (null if it's gone).
 */
export async function sendChatMessage(chatId: number): Promise<Chat | null> {
  const service = current;
  const uuid = await queueChatInput(chatId);
  if (uuid) await service?.pushChatMessages();
  return (await requireDb().chats.get(chatId)) ?? null;
}

/**
 * Sends a photo with an optional caption right away (`SyncService.sendPhoto`). Throws an ApiError if it couldn't
 * be sent: photos aren't kept for the next sync.
 */
export function sendChatPhoto(chatId: number, upload: ImageUpload, caption: string | null = null): Promise<void> {
  return requireService().chatSync.sendPhoto(chatId, upload, caption);
}

/** Marks the newest message of the chat as read (`SyncService.markRead`). Failures are ignored, it's tried again next time. */
export async function markChatRead(chatId: number): Promise<void> {
  const service = current;
  if (!service) return;
  try {
    // Like `authService.currentUser?.id`: also before the first sync stored the current user
    const userId = (await currentUser(service.database))?.serverId ?? sessionStore.get().userId;
    if (userId !== null) await service.chatSync.markRead(chatId, userId);
  } catch (error) {
    logSync.error(`Marking the chat ${chatId} as read failed`, error);
  }
}

/**
 * Stores a chat the server returned after creating, changing or joining it, and loads its new members
 * (`SyncService.store`). Use it instead of `storeChat` of lib/repo when the members may be new.
 */
export async function storeChatAndMembers(dto: ChatDTO): Promise<void> {
  if (current) await current.storeChat(dto);
  else await storeChat(dto);
}
