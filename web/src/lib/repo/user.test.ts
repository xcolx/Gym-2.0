import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deleteUserDb, openUserDb, type GymDB } from "@/lib/db";
import { registerSyncHandlers } from "@/lib/sync/registry";
import { makeUser, makeUserDTO } from "@/test/fixtures";
import { UnitSystem } from "@/types/models";
import { isHexColor, setDistanceUnit, setSchemeColor, setWeightUnit, storeUser, updateStoredUser } from "./user";

const USER_ID = 42;
let db: GymDB;
const requestSync = vi.fn();
let unregister: () => void;

beforeEach(async () => {
  db = (await openUserDb(USER_ID))!;
  requestSync.mockClear();
  unregister = registerSyncHandlers({ requestSync, pushPendingChanges: async () => true });
});

afterEach(async () => {
  unregister();
  await deleteUserDb(USER_ID);
});

describe("isHexColor", () => {
  it("accepts six hex digits with #", () => {
    expect(isHexColor("#FF0000")).toBe(true);
    expect(isHexColor("#a1b2c3")).toBe(true);
    expect(isHexColor("FF0000")).toBe(false);
    expect(isHexColor("#F00")).toBe(false);
    expect(isHexColor("#GG0000")).toBe(false);
    expect(isHexColor(null)).toBe(false);
    expect(isHexColor(undefined)).toBe(false);
  });
});

describe("settings", () => {
  it("can't be changed before the first sync stored the current user", async () => {
    await setWeightUnit(UnitSystem.imperial);
    expect(await db.users.count()).toBe(0);
  });

  it("changes the units and marks the user for the sync", async () => {
    await db.users.put(makeUser({ serverId: USER_ID, isCurrentUser: true, weightUnit: 0, distanceUnit: 0 }));
    await setWeightUnit(UnitSystem.imperial);
    await setDistanceUnit(UnitSystem.imperial);
    expect(await db.users.get(USER_ID)).toMatchObject({ weightUnit: 1, distanceUnit: 1, syncState: "updated" });
    expect(requestSync).toHaveBeenCalled();
  });

  it("changes only the current user", async () => {
    await db.users.bulkPut([makeUser({ serverId: 9, isFriend: true }), makeUser({ serverId: USER_ID, isCurrentUser: true })]);
    await setSchemeColor("#123abc");
    expect(await db.users.get(9)).toMatchObject({ schemeColor: null, syncState: "synced" });
    expect(await db.users.get(USER_ID)).toMatchObject({ schemeColor: "#123ABC", syncState: "updated" });
  });

  it("rejects an invalid color without changing anything", async () => {
    await db.users.put(makeUser({ serverId: USER_ID, isCurrentUser: true, schemeColor: "#FF0000" }));
    await expect(setSchemeColor("red")).rejects.toThrow("Invalid hex color: red");
    expect(await db.users.get(USER_ID)).toMatchObject({ schemeColor: "#FF0000", syncState: "synced" });
  });
});

describe("after online actions", () => {
  it("stores a new user without a sync", async () => {
    const user = await storeUser(makeUserDTO({ id: 9, username: "anna" }), { isFriend: true });
    expect(user).toMatchObject({ serverId: 9, username: "anna", isFriend: true, isBlocked: false, syncState: "synced" });
    expect(await db.users.get(9)).toEqual(user);
    expect(requestSync).not.toHaveBeenCalled();
  });

  it("keeps the flags of a stored user unless they are given", async () => {
    await db.users.put(makeUser({ serverId: 9, isFriend: true }));
    await storeUser(makeUserDTO({ id: 9, username: "renamed" }));
    expect(await db.users.get(9)).toMatchObject({ username: "renamed", isFriend: true });
    await storeUser(makeUserDTO({ id: 9 }), { isFriend: false, isBlocked: true });
    expect(await db.users.get(9)).toMatchObject({ isFriend: false, isBlocked: true });
  });

  it("keeps the unpushed settings of the current user", async () => {
    await db.users.put(makeUser({ serverId: USER_ID, isCurrentUser: true, bodyweight: 70, syncState: "updated" }));
    await storeUser(makeUserDTO({ id: USER_ID, username: "me", bodyweight: 90 }));
    expect(await db.users.get(USER_ID)).toMatchObject({ username: "me", bodyweight: 70, syncState: "updated", isCurrentUser: true });
  });

  it("changes fields of a stored user without marking it for the sync", async () => {
    await db.users.put(makeUser({ serverId: USER_ID, isCurrentUser: true }));
    await updateStoredUser(USER_ID, { username: "new", profileImageUrl: "hash", profileIconUrl: "icon" });
    expect(await db.users.get(USER_ID)).toMatchObject({ username: "new", profileImageUrl: "hash", syncState: "synced" });
    expect(requestSync).not.toHaveBeenCalled();
    // an unknown user is ignored
    await expect(updateStoredUser(404, { isBlocked: true })).resolves.toBeUndefined();
    expect(await db.users.get(404)).toBeUndefined();
  });
});
