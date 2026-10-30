import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { closeUserDb, getDb } from "@/lib/db";
import { registerSyncHandlers } from "@/lib/sync/registry";
import { canSync, handleSessionEnded, login, logout, restoreSession, SESSION_STORAGE_KEY, sessionStore } from "./session";

const me = {
  id: 5,
  username: "webtest",
  email: "webtest@example.com",
  profile_image_url: "",
  profile_icon_url: "",
  bodyweight: null,
  scheme_color: null,
  weight_unit: 0,
  distance_unit: 0,
  language: null,
  created_at: "2026-10-14T22:38:32.741685+00:00",
};

/** Answers the requests by path */
function mockBackend(routes: Record<string, () => Response>) {
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async (url) => {
    const path = url.replace("/api/v1", "").split("?")[0];
    const route = routes[path];
    if (!route) throw new TypeError("Failed to fetch");
    return route();
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const json = (status: number, body: unknown) => () => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, value),
    removeItem: (key: string) => void storage.delete(key),
  });
  sessionStore.set({ status: "loading", userId: null, currentUser: null });
});

afterEach(async () => {
  vi.unstubAllGlobals();
  closeUserDb();
  await Dexie.delete("gym2-user-5");
  await Dexie.delete("gym2-user-6");
});

const databaseExists = async () => (await indexedDB.databases()).some((db) => db.name === "gym2-user-5");

describe("session", () => {
  it("logs in, opens the database of the user and remembers the user", async () => {
    mockBackend({ "/auth/login/email": json(200, { success: true, message: "ok" }), "/users/me": json(200, me) });
    await login("webtest@example.com", "secret-password");
    expect(sessionStore.get()).toMatchObject({ status: "signedIn", userId: 5, currentUser: { username: "webtest" } });
    expect(getDb()?.name).toBe("gym2-user-5");
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBe('{"userId":5}');
  });

  it("restores the stored session offline and keeps the data when it ended", async () => {
    localStorage.setItem(SESSION_STORAGE_KEY, '{"userId":5}');
    mockBackend({});
    await restoreSession();
    expect(sessionStore.get()).toMatchObject({ status: "restoring", userId: 5 });
    await vi.waitFor(() => expect(getDb()).not.toBeNull());

    mockBackend({ "/users/me": json(401, { detail: "Session expired or invalid token." }) });
    await restoreSession();
    expect(sessionStore.get().status).toBe("signedOut");
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).not.toBeNull();
    handleSessionEnded();
    expect(await databaseExists()).toBe(true);
  });

  it("logs out only after the local changes were pushed, or when forced", async () => {
    mockBackend({
      "/auth/login/email": json(200, { success: true, message: "ok" }),
      "/users/me": json(200, me),
      "/auth/logout": json(200, { success: true, message: "Logout successful." }),
    });
    await login("webtest@example.com", "secret-password");

    const unregister = registerSyncHandlers({ requestSync: () => {}, pushPendingChanges: async () => false });
    expect(await logout()).toEqual({ loggedOut: false, reason: "unpushedChanges" });
    expect(sessionStore.get().status).toBe("signedIn");

    // forced: logged out, the database stays for the next login
    expect(await logout({ force: true })).toEqual({ loggedOut: true });
    expect(sessionStore.get()).toMatchObject({ status: "signedOut", userId: null });
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(await databaseExists()).toBe(true);
    unregister();

    // everything pushed: the database is deleted
    await login("webtest@example.com", "secret-password");
    expect(await logout()).toEqual({ loggedOut: true });
    expect(await databaseExists()).toBe(false);
  });

  it("never syncs the database of the stored user with the cookie of another user's login", async () => {
    // user 5 is stored, its session ended
    localStorage.setItem(SESSION_STORAGE_KEY, '{"userId":5}');
    mockBackend({ "/users/me": json(401, { detail: "Session expired or invalid token." }) });
    await restoreSession();
    await vi.waitFor(() => expect(getDb()?.name).toBe("gym2-user-5"));
    expect(sessionStore.get()).toMatchObject({ status: "signedOut", userId: 5 });

    // user 6 logs in: the cookie is replaced, then GET /users/me fails
    const fetchMock = mockBackend({ "/auth/login/email": json(200, { success: true, message: "ok" }) });
    await expect(login("other@example.com", "secret-password")).rejects.toMatchObject({ kind: "transport" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(getDb()).toBeNull();
    expect(sessionStore.get()).toMatchObject({ status: "signedOut", userId: null });

    // the next start doesn't open (or sync) the database of user 5 with the cookie of user 6
    await restoreSession();
    expect(sessionStore.get().status).toBe("signedOut");
    expect(getDb()).toBeNull();
    expect(await databaseExists()).toBe(true);
  });

  it("syncs only the database of the user GET /users/me confirmed", async () => {
    localStorage.setItem(SESSION_STORAGE_KEY, '{"userId":5}');
    mockBackend({});
    await restoreSession();
    await vi.waitFor(() => expect(getDb()?.name).toBe("gym2-user-5"));
    // offline: the app works, but nothing is synced until the session is confirmed
    expect(sessionStore.get().status).toBe("restoring");
    expect(canSync(sessionStore.get(), "gym2-user-5")).toBe(false);

    // the cookie belongs to user 6 (logged in in another tab)
    mockBackend({ "/users/me": json(200, { ...me, id: 6 }) });
    await restoreSession();
    expect(sessionStore.get()).toMatchObject({ status: "signedIn", userId: 6 });
    expect(canSync(sessionStore.get(), "gym2-user-5")).toBe(false);
    await vi.waitFor(() => expect(getDb()?.name).toBe("gym2-user-6"));
    expect(canSync(sessionStore.get(), getDb()?.name)).toBe(true);
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBe('{"userId":6}');
  });

  it("deletes the database of a former account with the same id (backend database reset)", async () => {
    const routes = { "/auth/login/email": json(200, { success: true, message: "ok" }), "/users/me": json(200, me) };
    mockBackend(routes);
    await login("webtest@example.com", "secret-password");
    await getDb()!.meta.put({ key: "syncTime.workoutSchemes", value: "2026-10-15T10:00:00Z" });
    await getDb()!.pendingSchemePerformances.put({ clientUUID: "4b3a1c2d-0000-4000-8000-000000000001" });

    // the same account logs in again: the data stays
    await login("webtest@example.com", "secret-password");
    expect(await getDb()!.pendingSchemePerformances.count()).toBe(1);

    // the backend was reset, a new account got id 5 again: logging in starts with an empty database
    const newAccount = { ...me, created_at: "2026-10-16T08:00:00.000000+00:00" };
    mockBackend({ ...routes, "/users/me": json(200, newAccount) });
    await login("new@example.com", "secret-password");
    expect(getDb()?.name).toBe("gym2-user-5");
    expect(await getDb()!.pendingSchemePerformances.count()).toBe(0);
    expect(await getDb()!.meta.get("syncTime.workoutSchemes")).toBeUndefined();
    expect((await getDb()!.meta.get("accountCreatedAt"))?.value).toBe("2026-10-16T08:00:00.000000+00:00");

    // also when the stored session is restored (the cookie of the new account, the database of the old one)
    await getDb()!.pendingSchemePerformances.put({ clientUUID: "4b3a1c2d-0000-4000-8000-000000000002" });
    await getDb()!.meta.put({ key: "accountCreatedAt", value: me.created_at });
    closeUserDb();
    await restoreSession();
    expect(sessionStore.get()).toMatchObject({ status: "signedIn", userId: 5 });
    expect(await getDb()!.pendingSchemePerformances.count()).toBe(0);
  });

  it("doesn't delete unpushed changes when logging out before the sync could start", async () => {
    localStorage.setItem(SESSION_STORAGE_KEY, '{"userId":5}');
    mockBackend({});
    await restoreSession();
    await vi.waitFor(() => expect(getDb()).not.toBeNull());
    await getDb()!.pendingSchemePerformances.put({ clientUUID: "4b3a1c2d-0000-4000-8000-000000000001" });

    // no sync engine runs while restoring: the changes can't be pushed
    expect(await logout()).toEqual({ loggedOut: false, reason: "unpushedChanges" });
    expect(await databaseExists()).toBe(true);
  });
});
