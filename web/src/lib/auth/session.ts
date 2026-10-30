// Port of ios/Gym 2.0/Core/Services/AuthService.swift. The session cookie is HTTP-only, so unlike on iOS the app can't
// see whether one is stored. Instead the id of the logged-in user is kept in the localStorage: while it is there the
// app starts "restoring" with the database of that user, so it works offline right away, and checks the session with
// GET /users/me.
//
// The sync only runs once GET /users/me confirmed that the cookie belongs to the stored user (`canSync`): the cookie
// is shared by all tabs and replaced by every login, so syncing while "restoring" could push the changes into the
// account of another user.

import { authApi, isApiError, onUnauthorized, userApi, type UserDTO } from "@/lib/api";
import { closeUserDb, deleteUserDb, openAccountDb, openUserDb, userDbName } from "@/lib/db";
import { clearImageCache } from "@/lib/pwa/image-cache";
import { createStore, useStore } from "@/lib/store";
import { pushPendingChanges } from "@/lib/sync/registry";

type SessionStatus =
  /** Before the stored session was read (first render, also during SSR) */
  | "loading"
  /** A user is stored but the session wasn't confirmed yet (e.g. offline). The app works like signed in. */
  | "restoring"
  | "signedIn"
  | "signedOut";

interface SessionState {
  status: SessionStatus;
  /** The server id of the logged-in user, set while restoring and signed in */
  userId: number | null;
  /** The profile from GET /users/me, null until it was loaded (e.g. offline). The stored User row has it too. */
  currentUser: UserDTO | null;
}

export const sessionStore = createStore<SessionState>({ status: "loading", userId: null, currentUser: null });

export function useSession(): SessionState {
  return useStore(sessionStore);
}

/** Restoring or signed in: the app can be used (`case .restoring, .signedIn` in RootView.swift) */
export function isSessionActive(state: SessionState): boolean {
  return state.status === "restoring" || state.status === "signedIn";
}

/**
 * Whether the database named `dbName` may be synced: only the database of the user GET /users/me confirmed for the
 * session cookie ("signedIn"). Never while "restoring", the cookie may belong to another user then (a login that
 * failed half way, a login in another tab).
 */
export function canSync(state: SessionState, dbName: string | null | undefined): boolean {
  return state.status === "signedIn" && state.userId !== null && dbName === userDbName(state.userId);
}

// MARK: - Stored session

export const SESSION_STORAGE_KEY = "gym2.session";

interface StoredSession {
  userId: number;
}

function readStoredSession(): StoredSession | null {
  try {
    const value = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value) as Partial<StoredSession>;
    return typeof parsed.userId === "number" ? { userId: parsed.userId } : null;
  } catch {
    return null;
  }
}

function writeStoredSession(session: StoredSession | null): void {
  try {
    if (session) localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // No storage: the session can't be restored after a reload, the user logs in again
  }
}

// MARK: - Starting

let started = false;

/**
 * Called once by the SessionProvider when the app starts: listens for ended sessions and restores the stored one.
 * Returns a cleanup function.
 */
export function startSession(): () => void {
  const stopUnauthorized = onUnauthorized((path) => {
    // Failed logins are 401 as well, but there is no session to lose then
    if (path.startsWith("/auth/login")) return;
    if (isSessionActive(sessionStore.get())) handleSessionEnded();
  });
  // A login or logout in another tab
  const onStorage = (event: StorageEvent) => {
    if (event.key !== SESSION_STORAGE_KEY) return;
    const stored = readStoredSession();
    if (!stored) {
      closeUserDb();
      sessionStore.set({ status: "signedOut", userId: null, currentUser: null });
    } else if (stored.userId !== sessionStore.get().userId) {
      void restoreSession();
    }
  };
  window.addEventListener("storage", onStorage);
  // A session that couldn't be checked (offline, server error) is checked again as soon as possible, the sync waits for it
  let rechecking = false;
  const recheck = () => {
    if (rechecking || sessionStore.get().status !== "restoring" || document.visibilityState !== "visible") return;
    rechecking = true;
    void restoreSession().finally(() => (rechecking = false));
  };
  window.addEventListener("online", recheck);
  document.addEventListener("visibilitychange", recheck);
  if (!started) {
    started = true;
    void restoreSession();
  }
  return () => {
    stopUnauthorized();
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("online", recheck);
    document.removeEventListener("visibilitychange", recheck);
  };
}

/** Checks the stored session (`AuthService.restoreSession`). Without a connection the session is kept. */
export async function restoreSession(): Promise<void> {
  const stored = readStoredSession();
  if (!stored) {
    sessionStore.set({ status: "signedOut", userId: null, currentUser: null });
    return;
  }
  sessionStore.set((state) => ({
    status: "restoring",
    userId: stored.userId,
    currentUser: state.userId === stored.userId ? state.currentUser : null,
  }));
  void openUserDb(stored.userId);
  try {
    const me = await userApi.me();
    // Logged out or in in the meantime (also in another tab): that change decides
    if (readStoredSession()?.userId !== stored.userId) return;
    if (me.id !== stored.userId) {
      // The cookie belongs to another user (e.g. logged in in another tab in the meantime)
      writeStoredSession({ userId: me.id });
    }
    // Before the sync may run: the database may still be the one of a former account with the same id
    await openAccountDb(me);
    if (readStoredSession()?.userId !== me.id) return;
    sessionStore.set({ status: "signedIn", userId: me.id, currentUser: me });
  } catch (error) {
    if (readStoredSession()?.userId !== stored.userId) return;
    if (isApiError(error) && error.kind === "unauthorized") {
      handleSessionEnded();
    }
    // Offline or server error: the session may still be valid, so the user isn't logged out
  }
}

// MARK: - Login and sign up

/**
 * Logs in and opens the database of the user. Throws an ApiError: 401 for wrong credentials, 403 with the code
 * "EmailVerificationError" if the email isn't verified yet, `transport` if offline.
 */
export async function login(email: string, password: string): Promise<void> {
  // The login replaces the cookie: from now on the stored user (e.g. the one whose session ended) must not be
  // restored or synced anymore, its database stays for its next login. If the login or GET /users/me fails, nobody
  // is stored and the next start shows the login.
  writeStoredSession(null);
  closeUserDb();
  sessionStore.set({ status: "signedOut", userId: null, currentUser: null });
  await authApi.loginWithEmail(email, password);
  // Unlike iOS, the id of the user is needed for the database, so this has to succeed
  const me = await userApi.me();
  writeStoredSession({ userId: me.id });
  await openAccountDb(me);
  sessionStore.set({ status: "signedIn", userId: me.id, currentUser: me });
}

/** Creates the account and sends the verification email. Returns the message to show. */
export async function signUp(email: string, password: string, username: string): Promise<string> {
  return (await authApi.signUpWithEmail(email, password, username)).message;
}

/** Returns the message to show. */
export async function resendVerificationEmail(email: string): Promise<string> {
  return (await authApi.resendVerificationEmail(email)).message;
}

/** Sends the email with the password reset link. Returns the message to show. */
export async function forgotPassword(email: string): Promise<string> {
  return (await authApi.forgotPassword(email)).message;
}

/** Loads the profile of the current user again, e.g. after changing the username or the profile image */
export async function refreshCurrentUser(): Promise<UserDTO> {
  const me = await userApi.me();
  sessionStore.set((state) => ({ ...state, currentUser: me }));
  return me;
}

// MARK: - Logout

/** Shown when the local changes couldn't be uploaded before a logout (UnpushedChanges.message on iOS) */
export const UNPUSHED_CHANGES_MESSAGE =
  "Some of your changes could not be uploaded, e.g. because you are offline. They stay on this device and are uploaded the next time you log in with this account.";

type LogoutResult = { loggedOut: true } | { loggedOut: false; reason: "unpushedChanges" };

/**
 * Uploads the local changes first (`pushPendingChanges()`), then ends the session and deletes the database of the user
 * from this device. If some changes can't be uploaded, nothing happens and `{ loggedOut: false }` is returned: the UI
 * asks the user (UNPUSHED_CHANGES_MESSAGE) and calls `logout({ force: true })` to log out anyway. A forced logout keeps
 * the database (it is deleted with the next normal logout), so the changes are uploaded with the next login.
 */
export async function logout(options: { force?: boolean } = {}): Promise<LogoutResult> {
  const { userId } = sessionStore.get();
  const isPushed = await pushPendingChanges();
  if (!isPushed && !options.force) return { loggedOut: false, reason: "unpushedChanges" };

  // Locally the user is always logged out, also if the request fails
  try {
    await authApi.logout();
  } catch {
    // e.g. offline: the session expires on the server by itself
  }
  endSession();
  if (userId !== null && isPushed) await deleteUserDb(userId);
  // Loaded again when they're shown, also after a forced logout
  await clearImageCache();
  return { loggedOut: true };
}

/**
 * Deletes the account (online) and all its data on this device, the password confirms it. The server ends the session.
 * Throws an ApiError if the server refused (e.g. a wrong password) or couldn't be reached, nothing is changed then.
 */
export async function deleteAccount(password: string): Promise<void> {
  const { userId } = sessionStore.get();
  await userApi.deleteAccount(password);
  endSession();
  if (userId !== null) await deleteUserDb(userId);
  await clearImageCache();
}

/**
 * The server ended the session (401): signed out, the stored user and the database stay, so the
 * unpushed changes are uploaded after the next login of the same user.
 */
export function handleSessionEnded(): void {
  sessionStore.set((state) => ({ status: "signedOut", userId: state.userId, currentUser: null }));
}

/** Forgets the stored session and closes the database */
function endSession(): void {
  writeStoredSession(null);
  closeUserDb();
  sessionStore.set({ status: "signedOut", userId: null, currentUser: null });
}
