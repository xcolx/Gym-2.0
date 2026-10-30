// @vitest-environment jsdom
// The engine listens for the visibility and online events of the page
import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deleteUserDb, openUserDb, type GymDB } from "@/lib/db";
import { createExercise, queueChatInput, setChatInput } from "@/lib/repo";
import type { ChatDTO } from "@/lib/api";
import { DbNotOpenError } from "@/lib/db";
import {
  dismissRejectedChanges,
  markChatRead,
  resync,
  sendChatMessage,
  sendChatPhoto,
  startSyncEngine,
  storeChatAndMembers,
  sync,
} from "./engine";
import { createLeaseLock, inTabLock } from "./lock";
import { pushPendingChanges, requestSync } from "./registry";
import { syncStore } from "./state";
import { FakeServer, offline } from "./testing/fake-server";

const USER_ID = 42;
let db: GymDB;
let server: FakeServer;
let stop: (() => void) | null = null;

beforeEach(async () => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  db = (await openUserDb(USER_ID))!;
  server = new FakeServer();
});

afterEach(async () => {
  stop?.();
  stop = null;
  vi.useRealTimers();
  setVisibility("visible");
  await deleteUserDb(USER_ID);
  vi.restoreAllMocks();
});

const start = (pushDelayMs = 10) => {
  stop = startSyncEngine(db, { api: server.api, lock: inTabLock(), pushDelayMs });
  return vi.waitFor(() => expect(syncStore.get().lastSyncDate).not.toBeNull());
};


/** Gives a sync that an event may have started the time to run */
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

const pulls = () => vi.mocked(server.api.exercises.muscles).mock.calls.length;

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

const exerciseDraft = (name: string) => ({
  name,
  aliases: [],
  exerciseDescription: null,
  muscleGroupId: 1,
  equipmentId: 1,
  primaryMuscleIds: [1],
  secondaryMuscleIds: [],
  tracksReps: true,
  tracksWeights: false,
  tracksTime: false,
  tracksIntensity: false,
  tracksDistance: false,
});

const directChat = (fields: Partial<ChatDTO> = {}): ChatDTO => ({
  id: 3,
  groupChat: false,
  name: null,
  imageUrl: null,
  createdAt: "2026-10-01T10:00:00+00:00",
  createdBy: USER_ID,
  public: false,
  latestMessageTimestamp: null,
  latestMessagePreview: null,
  latestMessageSenderId: null,
  members: [{ userId: USER_ID, lastReadMessageId: 0, admin: null }],
  messages: [],
  ...fields,
});

describe("sync engine", () => {
  it("syncs when it starts and registers the sync handlers", async () => {
    await start();
    expect(await db.exercises.count()).toBe(2);

    await createExercise({
      name: "Fly",
      aliases: [],
      exerciseDescription: null,
      muscleGroupId: 1,
      equipmentId: 1,
      primaryMuscleIds: [1],
      secondaryMuscleIds: [],
      tracksReps: true,
      tracksWeights: false,
      tracksTime: false,
      tracksIntensity: false,
      tracksDistance: false,
    });
    // createExercise called requestSync(): pushed after the delay
    await vi.waitFor(() => expect(server.api.exercises.create).toHaveBeenCalledTimes(1));
    expect(await pushPendingChanges()).toBe(true);
  });

  it("resets its state and the handlers when it stops", async () => {
    await start();
    vi.mocked(server.api.exercises.muscles).mockRejectedValueOnce(offline());
    await sync();
    expect(syncStore.get().state).toBe("failed");
    stop!();
    stop = null;
    expect(syncStore.get()).toMatchObject({ state: "idle", lastSyncDate: null });
    // without an engine nothing is pushed
    await createExercise({
      name: "Offline",
      aliases: [],
      exerciseDescription: null,
      muscleGroupId: 1,
      equipmentId: 1,
      primaryMuscleIds: [1],
      secondaryMuscleIds: [],
      tracksReps: true,
      tracksWeights: false,
      tracksTime: false,
      tracksIntensity: false,
      tracksDistance: false,
    });
    requestSync();
    expect(server.api.exercises.create).not.toHaveBeenCalled();
  });

  it("sends a chat message right away", async () => {
    server.chats.set(3, {
      id: 3,
      groupChat: false,
      name: null,
      imageUrl: null,
      createdAt: "2026-10-01T10:00:00+00:00",
      createdBy: USER_ID,
      public: false,
      latestMessageTimestamp: null,
      latestMessagePreview: null,
      latestMessageSenderId: null,
      members: [{ userId: USER_ID, lastReadMessageId: 0, admin: null }],
      messages: [],
    });
    await start();
    await setChatInput(3, "Hi");
    await sendChatMessage(3);
    expect(server.api.chats.sendMessage).toHaveBeenCalledTimes(1);
    expect(await db.chats.get(3)).toMatchObject({ input: "", inputUUID: null });

    // queued by a feature with queueChatInput: sent by the requestSync() of the write
    await setChatInput(3, "Again");
    await queueChatInput(3);
    await vi.waitFor(() => expect(server.api.chats.sendMessage).toHaveBeenCalledTimes(2));
    dismissRejectedChanges();
  });
  it("pulls when the page becomes visible or the browser goes online, if the last pull is old enough", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await start();
    const afterStart = pulls();

    // Right after a pull, switching tabs doesn't pull again
    window.dispatchEvent(new Event("online"));
    await settle();
    const afterEarlyEvent = pulls();
    expect(afterEarlyEvent).toBe(afterStart);

    vi.setSystemTime(Date.now() + 20_000);
    setVisibility("visible");
    await vi.waitFor(() => expect(pulls()).toBe(afterEarlyEvent + 1));

    vi.setSystemTime(Date.now() + 20_000);
    window.dispatchEvent(new Event("online"));
    await vi.waitFor(() => expect(pulls()).toBe(afterEarlyEvent + 2));
  });

  it("pushes a scheduled sync right away when the page is hidden", async () => {
    await start(60_000);
    await createExercise(exerciseDraft("Fly"));
    expect(server.api.exercises.create).not.toHaveBeenCalled();

    setVisibility("hidden");

    await vi.waitFor(() => expect(server.api.exercises.create).toHaveBeenCalledTimes(1));
  });

  it("syncs every 5 minutes while the page is visible", async () => {
    vi.useFakeTimers({ toFake: ["setInterval"] });
    await start();
    const before = pulls();

    setVisibility("hidden");
    vi.advanceTimersByTime(5 * 60_000);
    await settle();
    expect(pulls()).toBe(before);

    setVisibility("visible");
    vi.advanceTimersByTime(5 * 60_000);
    await vi.waitFor(() => expect(pulls()).toBe(before + 1));
  });

  it("stops listening for the page events when it stops", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await start();
    stop!();
    stop = null;
    const before = pulls();

    vi.setSystemTime(Date.now() + 20_000);
    window.dispatchEvent(new Event("online"));
    setVisibility("visible");
    await settle();

    expect(pulls()).toBe(before);
  });

  it("loads everything again with a resync", async () => {
    await start();
    const fullLoads = vi.mocked(server.api.exercises.all).mock.calls.length;

    await resync();

    expect(server.api.exercises.all).toHaveBeenCalledTimes(fullLoads + 1);
    expect(syncStore.get().state).toBe("idle");
  });

  it("marks the newest message of a chat as read and ignores failures", async () => {
    server.chats.set(3, directChat({
      messages: [{ id: 7, chatId: 3, senderId: 5, createdAt: "2026-10-01T11:00:00+00:00", content: "Hi", imageUrl: null }],
      members: [
        { userId: USER_ID, lastReadMessageId: 0, admin: null },
        { userId: 5, lastReadMessageId: 7, admin: null },
      ],
    }));
    await start();

    vi.mocked(server.api.chats.markRead).mockRejectedValueOnce(offline());
    await expect(markChatRead(3)).resolves.toBeUndefined();
    await markChatRead(3);

    expect(server.api.chats.markRead).toHaveBeenLastCalledWith(3, 7);
    expect((await db.chatMembers.get([3, USER_ID]))?.lastReadMessageId).toBe(7);
  });

  it("stores chats with and without a running engine", async () => {
    // Without an engine (e.g. right after the login) the chat is stored directly
    await storeChatAndMembers(directChat({ id: 4 }));
    expect(await db.chats.get(4)).toBeDefined();

    await start();
    await storeChatAndMembers(directChat({ id: 5 }));
    expect(await db.chats.get(5)).toBeDefined();
  });

  it("can't send a photo without a running engine", () => {
    const upload = { data: new Blob(["x"], { type: "image/jpeg" }), filename: "a.jpg" };
    expect(() => sendChatPhoto(3, upload as never)).toThrow(DbNotOpenError);
  });
});

describe("lease lock", () => {
  it("lets only one holder of the lease run at a time", async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
    };
    const tabA = createLeaseLock("test", storage)!;
    const tabB = createLeaseLock("test", storage)!;
    let running = 0;
    let maxRunning = 0;
    const task = () => async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((resolve) => setTimeout(resolve, 80));
      running--;
    };
    await Promise.all([tabA(task()), tabB(task())]);
    expect(maxRunning).toBe(1);
    expect(values.size).toBe(0);
  });
});
