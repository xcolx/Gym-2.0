import "fake-indexeddb/auto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { closeUserDb, deleteUserDb, openUserDb } from "@/lib/db";
import { pushPendingChanges, registerSyncHandlers, requestSync } from "./registry";

afterEach(async () => {
  closeUserDb();
  await deleteUserDb(42);
  vi.restoreAllMocks();
});

describe("without a sync engine", () => {
  it("ignores requested syncs", () => {
    expect(() => requestSync()).not.toThrow();
  });

  it("can't push, so it resolves to whether the open database has nothing to push", async () => {
    // no database open: nothing that could be lost
    expect(await pushPendingChanges()).toBe(true);

    const db = (await openUserDb(42))!;
    expect(await pushPendingChanges()).toBe(true);
    await db.pendingDeletions.put({ kind: "workout", serverId: 1 });
    expect(await pushPendingChanges()).toBe(false);
  });
});

describe("with a sync engine", () => {
  it("calls the registered handlers until they are removed", async () => {
    const handlers = { requestSync: vi.fn(), pushPendingChanges: vi.fn(async () => false) };
    const unregister = registerSyncHandlers(handlers);
    requestSync();
    expect(handlers.requestSync).toHaveBeenCalledTimes(1);
    expect(await pushPendingChanges()).toBe(false);

    unregister();
    requestSync();
    expect(handlers.requestSync).toHaveBeenCalledTimes(1);
    expect(await pushPendingChanges()).toBe(true);
  });

  it("keeps newer handlers when older ones are removed", () => {
    const first = { requestSync: vi.fn(), pushPendingChanges: async () => true };
    const second = { requestSync: vi.fn(), pushPendingChanges: async () => true };
    const unregisterFirst = registerSyncHandlers(first);
    const unregisterSecond = registerSyncHandlers(second);
    unregisterFirst();
    requestSync();
    expect(second.requestSync).toHaveBeenCalledTimes(1);
    expect(first.requestSync).not.toHaveBeenCalled();
    unregisterSecond();
  });

  it("never throws, a failed push resolves to false", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const unregister = registerSyncHandlers({
      requestSync: () => {
        throw new Error("boom");
      },
      pushPendingChanges: async () => {
        throw new Error("offline");
      },
    });
    expect(() => requestSync()).not.toThrow();
    expect(await pushPendingChanges()).toBe(false);
    expect(console.error).toHaveBeenCalledTimes(2);
    unregister();
  });
});
