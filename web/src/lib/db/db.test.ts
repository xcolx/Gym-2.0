import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addPendingDeletion,
  addPendingSchemePerformance,
  closeUserDb,
  DbNotOpenError,
  deleteUserDb,
  getDb,
  getMeta,
  getPendingDeletions,
  getPendingSchemePerformances,
  getSyncTime,
  GymDB,
  isAnySyncTimeMissing,
  openAccountDb,
  openUserDb,
  removeAllSyncTimes,
  removePendingDeletion,
  removePendingSchemePerformance,
  removeSyncTime,
  requireDb,
  setMeta,
  setSyncTime,
  SYNC_TIME_TYPES,
  userDbName,
} from "./index";

afterEach(async () => {
  closeUserDb();
  for (const id of [1, 2, 42]) await deleteUserDb(id);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("schema", () => {
  it("names the database by the user", () => {
    expect(userDbName(42)).toBe("gym2-user-42");
  });

  it("lists every table either as data or as sync bookkeeping", async () => {
    const db = (await openUserDb(42))!;
    const listed = [...db.dataTables, ...db.syncTables].map((table) => table.name).sort();
    expect(listed).toEqual(db.tables.map((table) => table.name).sort());
  });

  it("creates the indexes the queries use", async () => {
    const db = (await openUserDb(42))!;
    const indexes = (table: string) => db.table(table).schema.indexes.map((index) => index.name);
    expect(db.chatMembers.schema.primKey.name).toBe("[chatId+userId]");
    expect(indexes("messages")).toContain("[chatId+serverId]");
    expect(indexes("workoutExercises")).toEqual(expect.arrayContaining(["workoutId", "[workoutId+index]", "syncState"]));
    expect(indexes("workoutSchemeExercises")).toEqual(expect.arrayContaining(["schemeId", "[schemeId+index]"]));
    expect(db.pendingDeletions.schema.primKey.name).toBe("[kind+serverId]");
  });

  it("opens a database created by an earlier page load with the same schema and keeps its data", async () => {
    const first = new GymDB(userDbName(1));
    await first.open();
    await first.users.put({
      serverId: 1,
      syncState: "synced",
      username: "colin",
      profileImageUrl: "",
      profileIconUrl: "",
      language: null,
      email: null,
      createdAt: null,
      bodyweight: null,
      schemeColor: null,
      weightUnit: null,
      distanceUnit: null,
      isCurrentUser: true,
      isFriend: false,
      isBlocked: false,
    });
    const version = first.verno;
    first.close();

    const db = (await openUserDb(1))!;
    expect(db.verno).toBe(version);
    expect(await db.users.get(1)).toMatchObject({ username: "colin" });
    expect(await getMeta(db, "userId")).toBe(1);
  });

  it("doesn't index null values, rows without server id are only found by a filter", async () => {
    const db = (await openUserDb(42))!;
    await db.chats.put({
      serverId: 1,
      groupChat: false,
      name: null,
      imageUrl: null,
      createdAt: new Date(),
      createdById: null,
      isPublic: false,
      latestMessageTimestamp: null,
      latestMessagePreview: null,
      latestMessageSenderId: null,
      input: "",
      inputUUID: null,
    });
    expect(await db.chats.orderBy("latestMessageTimestamp").count()).toBe(0);
    expect(await db.chats.count()).toBe(1);
  });
});

describe("connection", () => {
  it("has no database before one is opened", () => {
    expect(getDb()).toBeNull();
    expect(() => requireDb()).toThrow(DbNotOpenError);
  });

  it("opens a database once for callers that open it at the same time", async () => {
    const [a, b] = await Promise.all([openUserDb(42), openUserDb(42)]);
    expect(a).toBe(b);
    expect(await openUserDb(42)).toBe(a);
    expect(requireDb()).toBe(a);
  });

  it("opens the last requested user if another is requested while one is opening", async () => {
    const first = openUserDb(1);
    const second = openUserDb(2);
    expect(await first).toBeNull();
    const db = await second;
    expect(db?.name).toBe("gym2-user-2");
    expect(getDb()).toBe(db);
  });

  it("closes the database without deleting its data", async () => {
    const db = (await openUserDb(42))!;
    await setMeta(db, "lastSyncDate", new Date(2026, 9, 1));
    closeUserDb();
    expect(getDb()).toBeNull();
    expect(db.isOpen()).toBe(false);

    const reopened = (await openUserDb(42))!;
    expect(await getMeta(reopened, "lastSyncDate")).toEqual(new Date(2026, 9, 1));
  });

  it("deletes the database with its data and closes it", async () => {
    const db = (await openUserDb(42))!;
    await setMeta(db, "lastSyncDate", new Date());
    await deleteUserDb(42);
    expect(getDb()).toBeNull();
    expect(await Dexie.exists(userDbName(42))).toBe(false);
    const reopened = (await openUserDb(42))!;
    expect(await getMeta(reopened, "lastSyncDate")).toBeUndefined();
  });

  it("doesn't close the open database when another user's database is deleted", async () => {
    const db = (await openUserDb(42))!;
    await deleteUserDb(1);
    expect(getDb()).toBe(db);
  });

  it("closes the database when another tab deletes it", async () => {
    const db = (await openUserDb(42))!;
    // what the logout in another tab does
    await Dexie.delete(userDbName(42));
    expect(db.isOpen()).toBe(false);
    expect(getDb()).toBeNull();
  });

  it("resolves to null without IndexedDB", async () => {
    vi.stubGlobal("indexedDB", undefined);
    expect(await openUserDb(42)).toBeNull();
    expect(getDb()).toBeNull();
    await expect(deleteUserDb(42)).resolves.toBeUndefined();
  });

  it("resolves to null if the database can't be opened", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(GymDB.prototype, "open").mockRejectedValueOnce(new Error("blocked"));
    expect(await openUserDb(42)).toBeNull();
    expect(getDb()).toBeNull();
    // a later attempt works again
    expect(await openUserDb(42)).not.toBeNull();
  });
});

describe("openAccountDb", () => {
  it("stores when the account was created and keeps the data of that account", async () => {
    const account = { id: 42, createdAt: "2026-10-01T10:00:00+00:00" };
    const db = (await openAccountDb(account))!;
    expect(await getMeta(db, "accountCreatedAt")).toBe(account.createdAt);
    await setSyncTime(db, "workouts", "5");

    const again = (await openAccountDb(account))!;
    expect(await getSyncTime(again, "workouts")).toBe("5");
  });

  it("deletes the database of a former account with the same id", async () => {
    const db = (await openAccountDb({ id: 42, createdAt: "2026-10-01T10:00:00+00:00" }))!;
    await setSyncTime(db, "workouts", "5");
    closeUserDb();

    const fresh = (await openAccountDb({ id: 42, createdAt: "2026-10-20T10:00:00+00:00" }))!;
    expect(await getSyncTime(fresh, "workouts")).toBeUndefined();
    expect(await getMeta(fresh, "accountCreatedAt")).toBe("2026-10-20T10:00:00+00:00");
  });

  it("takes a database without the date as the account's, and checks nothing without createdAt", async () => {
    const db = (await openUserDb(42))!;
    await setSyncTime(db, "workouts", "5");
    closeUserDb();

    const unchecked = (await openAccountDb({ id: 42, createdAt: null }))!;
    expect(await getMeta(unchecked, "accountCreatedAt")).toBeUndefined();
    const adopted = (await openAccountDb({ id: 42, createdAt: "2026-10-01T10:00:00+00:00" }))!;
    expect(await getSyncTime(adopted, "workouts")).toBe("5");
    expect(await getMeta(adopted, "accountCreatedAt")).toBe("2026-10-01T10:00:00+00:00");
  });
});

describe("sync meta", () => {
  it("stores the sync time of every type, as the server sent it", async () => {
    const db = (await openUserDb(42))!;
    expect(await isAnySyncTimeMissing(db)).toBe(true);
    for (const type of SYNC_TIME_TYPES) await setSyncTime(db, type, `2026-10-15T08:00:00.123456+00:00 ${type}`);
    expect(await isAnySyncTimeMissing(db)).toBe(false);
    expect(await getSyncTime(db, "chats")).toBe("2026-10-15T08:00:00.123456+00:00 chats");

    await removeSyncTime(db, "workouts");
    expect(await getSyncTime(db, "workouts")).toBeUndefined();
    expect(await getSyncTime(db, "exercises")).toBeDefined();
    expect(await isAnySyncTimeMissing(db)).toBe(true);

    await removeAllSyncTimes(db);
    for (const type of SYNC_TIME_TYPES) expect(await getSyncTime(db, type)).toBeUndefined();
    // other meta values stay
    expect(await getMeta(db, "userId")).toBe(42);
  });

  it("stores dates as dates", async () => {
    const db = (await openUserDb(42))!;
    const date = new Date(2026, 9, 15, 8, 30);
    await setMeta(db, "lastPullDate", date);
    const stored = await getMeta(db, "lastPullDate");
    expect(stored).toBeInstanceOf(Date);
    expect(stored).toEqual(date);
  });

  it("records the deletions of pushed objects only, once per object", async () => {
    const db = (await openUserDb(42))!;
    await addPendingDeletion(db, "workout", null);
    await addPendingDeletion(db, "workout", 5);
    await addPendingDeletion(db, "workout", 5);
    await addPendingDeletion(db, "exercise", 5);
    expect(await getPendingDeletions(db)).toEqual([
      { kind: "exercise", serverId: 5 },
      { kind: "workout", serverId: 5 },
    ]);
    await removePendingDeletion(db, { kind: "workout", serverId: 5 });
    expect(await getPendingDeletions(db)).toEqual([{ kind: "exercise", serverId: 5 }]);
  });

  it("keeps the transaction of a deletion that needs no database work", async () => {
    const db = (await openUserDb(42))!;
    await db.transaction("rw", [db.pendingDeletions, db.meta], async () => {
      await addPendingDeletion(db, "workout", null);
      // would throw a PrematureCommitError if the transaction had been lost
      await setMeta(db, "lastSyncDate", new Date());
      await addPendingDeletion(db, "workout", 1);
    });
    expect(await getPendingDeletions(db)).toHaveLength(1);
  });

  it("records the schemes a workout was started from, once each", async () => {
    const db = (await openUserDb(42))!;
    await addPendingSchemePerformance(db, "a");
    await addPendingSchemePerformance(db, "a");
    await addPendingSchemePerformance(db, "b");
    expect((await getPendingSchemePerformances(db)).sort()).toEqual(["a", "b"]);
    await removePendingSchemePerformance(db, "a");
    expect(await getPendingSchemePerformances(db)).toEqual(["b"]);
  });
});
