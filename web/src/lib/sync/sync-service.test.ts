import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { getSyncTime, setMeta } from "@/lib/db";
import { createExercise, createScheme, queueChatInput, setBodyweight, setChatInput } from "@/lib/repo";
import { FULL_CHAT_RELOAD_INTERVAL_MS } from "./chat-sync";
import { offline, rejected, syncTimeExpired } from "./testing/fake-server";
import {
  db,
  input,
  localExercise,
  server,
  serverExercise,
  service,
  setupSyncTest,
  status,
  USER_ID,
} from "./testing/harness";
import { inTabLock } from "./lock";
import { SyncService } from "./sync-service";

setupSyncTest();

describe("first sync", () => {
  it("loads the reference data, exercises, the current user and every sync time", async () => {
    await service.sync();
    expect(status().state).toBe("idle");
    expect(status().lastSyncDate).toBeInstanceOf(Date);
    expect(await db.muscles.count()).toBe(1);
    expect(await db.equipment.count()).toBe(2);
    expect((await db.exercises.toArray()).map((exercise) => exercise.name).sort()).toEqual(["Bench Press", "Squat"]);
    const me = await db.users.get(USER_ID);
    expect(me).toMatchObject({ isCurrentUser: true, bodyweight: 80, syncState: "synced" });
    for (const type of ["exercises", "workoutSchemes", "workouts", "chats"] as const) {
      expect(await getSyncTime(db, type)).toBeDefined();
    }
    expect(server.api.exercises.all).toHaveBeenCalledTimes(1);

    // the next pull is a delta
    await service.sync();
    expect(server.api.exercises.all).toHaveBeenCalledTimes(1);
    expect(server.api.exercises.changes).toHaveBeenCalledTimes(1);
  });
});

describe("settings", () => {
  beforeEach(() => service.sync());

  it("pushes the settings and keeps unpushed ones when pulling", async () => {
    await setBodyweight(75.5);
    expect((await db.users.get(USER_ID))?.syncState).toBe("updated");
    await service.sync();
    expect(server.api.users.updateProfile).toHaveBeenCalledWith(expect.objectContaining({ bodyweight: 75.5 }));
    expect(await db.users.get(USER_ID)).toMatchObject({ bodyweight: 75.5, syncState: "synced" });

    // offline push: the pull of a later sync keeps the local value
    await setBodyweight(70);
    vi.mocked(server.api.users.updateProfile).mockRejectedValueOnce(offline());
    await service.sync();
    expect(status().state).toBe("failed");
    expect(await db.users.get(USER_ID)).toMatchObject({ bodyweight: 70, syncState: "updated" });
    await service.sync();
    expect(server.me.bodyweight).toBe(70);
  });

  it("replaces rejected settings with the server's", async () => {
    await setBodyweight(75);
    vi.mocked(server.api.users.updateProfile).mockRejectedValueOnce(rejected(422, "Invalid bodyweight"));
    await service.sync();
    expect(status().rejectedChanges).toEqual(["Your settings could not be saved: Invalid bodyweight"]);
    expect(await db.users.get(USER_ID)).toMatchObject({ bodyweight: 80, syncState: "synced" });
  });

  it("replaces rejected settings with the server's also in a sync that doesn't pull", async () => {
    await setBodyweight(75);
    vi.mocked(server.api.users.updateProfile).mockRejectedValueOnce(rejected(422, "Invalid bodyweight"));
    const pulls = vi.mocked(server.api.exercises.changes).mock.calls.length;
    // the sync after a local change, the last pull is just a moment ago
    await service.run(false);
    expect(server.api.exercises.changes).toHaveBeenCalledTimes(pulls);
    expect(status().rejectedChanges).toEqual(["Your settings could not be saved: Invalid bodyweight"]);
    expect(await db.users.get(USER_ID)).toMatchObject({ bodyweight: 80, syncState: "synced", isCurrentUser: true });
  });
});

describe("chats", () => {
  beforeEach(async () => {
    server.chats.set(7, {
      id: 7,
      groupChat: true,
      name: "Gym",
      imageUrl: null,
      createdAt: "2026-10-01T10:00:00+00:00",
      createdBy: USER_ID,
      public: false,
      latestMessageTimestamp: null,
      latestMessagePreview: null,
      latestMessageSenderId: null,
      members: [
        { userId: USER_ID, lastReadMessageId: 0, admin: null },
        { userId: 9, lastReadMessageId: 0, admin: null },
      ],
      messages: [],
    });
    server.otherUsers.set(9, { ...server.me, id: 9, username: "friend", email: null, bodyweight: null });
    await service.sync();
  });

  it("pulls the chats and loads their members", async () => {
    expect(await db.chats.get(7)).toMatchObject({ name: "Gym" });
    expect(await db.chatMembers.where("chatId").equals(7).count()).toBe(2);
    expect(await db.users.get(9)).toMatchObject({ username: "friend", isFriend: false });
  });

  it("sends a queued input with its UUID until the server accepted it", async () => {
    await setChatInput(7, "  Hello  ");
    const uuid = await queueChatInput(7);
    vi.mocked(server.api.chats.sendMessage).mockRejectedValueOnce(offline());
    await service.pushChatMessages();
    expect((await db.chats.get(7))?.inputUUID).toBe(uuid);

    await service.pushChatMessages();
    expect(vi.mocked(server.api.chats.sendMessage).mock.calls.map(([, options]) => options)).toEqual([
      { text: "Hello", clientUuid: uuid },
      { text: "Hello", clientUuid: uuid },
    ]);
    expect(await db.chats.get(7)).toMatchObject({ input: "", inputUUID: null, latestMessagePreview: "Hello" });
    expect(await db.messages.where("chatId").equals(7).count()).toBe(1);
  });

  it("never sends a queued message twice at the same time, whoever asks for it", async () => {
    await setChatInput(7, "Hello");
    await queueChatInput(7);
    const send = vi.mocked(server.api.chats.sendMessage);
    const original = send.getMockImplementation()!;
    let running = 0;
    let maxRunning = 0;
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    send.mockImplementation(async (...args) => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await released;
      try {
        return await original(...args);
      } finally {
        running -= 1;
      }
    });

    // a local change, a poll and a sync at once
    const all = Promise.all([service.pushChatMessages(), service.syncChats(), service.sync(), service.pushChatMessages()]);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    release();
    await all;
    expect(maxRunning).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(await db.messages.where("chatId").equals(7).count()).toBe(1);
    expect((await db.chats.get(7))?.inputUUID).toBeNull();
  });

  it("keeps a rejected message in the input field without sending it again", async () => {
    await setChatInput(7, "Blocked");
    await queueChatInput(7);
    vi.mocked(server.api.chats.sendMessage).mockRejectedValueOnce(rejected(403, "You can't write here"));
    await service.pushChatMessages();
    expect(await db.chats.get(7)).toMatchObject({ input: "Blocked", inputUUID: null });
    expect(status().rejectedChanges).toEqual(["Your message could not be sent: You can't write here"]);
  });

  it("stores a sent photo with the server's preview", async () => {
    await service.chatSync.sendPhoto(7, { data: new Blob(["x"]), filename: "image.jpg", mimeType: "image/jpeg" }, null);
    expect(await db.chats.get(7)).toMatchObject({ latestMessagePreview: "📷 Photo", latestMessageSenderId: USER_ID });
    expect(await db.messages.where("chatId").equals(7).count()).toBe(1);

    await service.chatSync.sendPhoto(7, { data: new Blob(["x"]), filename: "image.jpg", mimeType: "image/jpeg" }, "Leg day 🦵🏽");
    expect((await db.chats.get(7))?.latestMessagePreview).toBe("Leg day 🦵🏽");
  });

  it("marks the newest message as read once, also when asked again while the request runs", async () => {
    const chat = server.chats.get(7)!;
    chat.messages.push({ id: 1, chatId: 7, senderId: 9, createdAt: "2026-10-15T08:01:00+00:00", content: "Hi", imageUrl: null });
    await service.chatSync.store(structuredClone(chat));
    let finish = () => {};
    vi.mocked(server.api.chats.markRead).mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)));

    const first = service.chatSync.markRead(7, USER_ID);
    await vi.waitFor(() => expect(server.api.chats.markRead).toHaveBeenCalledTimes(1));
    await service.chatSync.markRead(7, USER_ID);
    finish();
    await first;
    await service.chatSync.markRead(7, USER_ID);

    expect(server.api.chats.markRead).toHaveBeenCalledTimes(1);
    expect(server.api.chats.markRead).toHaveBeenCalledWith(7, 1);
    expect((await db.chatMembers.get([7, USER_ID]))?.lastReadMessageId).toBe(1);
  });

  it("loads all chats again after an incomplete delta at most every 30 seconds", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(Date.now());
      const all = vi.mocked(server.api.chats.all);
      expect(all).toHaveBeenCalledTimes(1);
      // a chat the deltas don't contain (the read states do)
      server.chats.set(8, { ...structuredClone(server.chats.get(7)!), id: 8, name: "New" });

      for (let poll = 0; poll < 5; poll++) await service.syncChats();
      expect(all).toHaveBeenCalledTimes(1);
      expect(server.api.chats.changes).toHaveBeenCalledTimes(5);
      expect(await db.chats.get(8)).toBeUndefined();

      vi.setSystemTime(Date.now() + FULL_CHAT_RELOAD_INTERVAL_MS);
      await service.syncChats();
      expect(all).toHaveBeenCalledTimes(2);
      expect(await db.chats.get(8)).toMatchObject({ name: "New" });

      // complete again: deltas only
      await service.syncChats();
      expect(all).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("loads all chats instead of a delta whose sync time expired and removes the messages deleted in the meantime", async () => {
    const message = (id: number, content: string) => ({
      id,
      chatId: 7,
      senderId: 9,
      createdAt: "2026-10-02T10:00:00+00:00",
      content,
      imageUrl: null,
    });
    server.chats.get(7)!.messages.push(message(501, "kept"), message(502, "deleted later"));
    server.pruneHistory();
    await service.syncChats();
    expect(await db.messages.where("chatId").equals(7).count()).toBe(2);

    // deleted on the server, the deletion was removed for good before this client synced again
    server.chats.get(7)!.messages.pop();
    server.pruneHistory();
    const all = vi.mocked(server.api.chats.all);
    all.mockClear();
    await service.syncChats();
    await expect(vi.mocked(server.api.chats.changes).mock.results.at(-1)!.value).rejects.toMatchObject({ code: "SyncTimeExpiredError" });
    expect(all).toHaveBeenCalledTimes(1);
    expect((await db.messages.where("chatId").equals(7).toArray()).map((m) => m.serverId)).toEqual([501]);
  });

  it("removes a chat the user isn't a member of anymore", async () => {
    server.chats.delete(7);
    await service.syncChats();
    expect(await db.chats.get(7)).toBeUndefined();
    expect(await db.chatMembers.where("chatId").equals(7).count()).toBe(0);
  });
});

describe("sync time older than 28 days", () => {
  it("loads everything instead and removes the exercises, workouts and schemes deleted in the meantime", async () => {
    const deadlift = server.addExercise({ name: "Deadlift", verified: true });
    await service.sync();
    const bench = (await localExercise("Bench Press"))!;
    const scheme = await createScheme("Push", [bench.id]);
    const workout = await server.api.workouts.create({
      clientUuid: "4b3a1c2d-0000-4000-8000-000000000002",
      name: "Other device",
      date: "2026-10-15T08:00:00.000Z",
      duration: 30,
      inProgress: false,
      exercises: [{ clientUuid: null, exerciseId: serverExercise("Bench Press")!.id, unilateral: false, index: 0, reps: [5], weights: [100], time: null, intensity: null, distance: null }],
    });
    await service.sync();
    const localWorkout = (await db.workouts.filter((row) => row.serverId === workout.id).first())!;
    const schemeServerId = (await db.workoutSchemes.get(scheme.id))!.serverId!;
    expect(await localExercise("Deadlift")).toBeDefined();

    // deleted on another device, and removed for good before this client synced again
    server.removeExercise(deadlift.id);
    server.removeWorkout(workout.id);
    server.removeScheme(schemeServerId);
    server.pruneHistory();
    vi.mocked(server.api.exercises.all).mockClear();
    vi.mocked(server.api.workouts.all).mockClear();
    vi.mocked(server.api.schemes.all).mockClear();
    await service.sync();

    expect(status().state).toBe("idle");
    expect(server.api.exercises.all).toHaveBeenCalledTimes(1);
    expect(server.api.workouts.all).toHaveBeenCalledTimes(1);
    expect(server.api.schemes.all).toHaveBeenCalledTimes(1);
    expect(await localExercise("Deadlift")).toBeUndefined();
    expect(await localExercise("Bench Press")).toBeDefined();
    expect(await db.workouts.get(localWorkout.id)).toBeUndefined();
    expect(await db.workoutExercises.where("workoutId").equals(localWorkout.id).count()).toBe(0);
    expect(await db.workoutSchemes.get(scheme.id)).toBeUndefined();
    expect(await db.workoutSchemeExercises.where("schemeId").equals(scheme.id).count()).toBe(0);

    // the full load stored new sync times, so the next sync uses the deltas again
    await service.sync();
    expect(server.api.exercises.all).toHaveBeenCalledTimes(1);
    expect(server.api.workouts.all).toHaveBeenCalledTimes(1);
    expect(server.api.schemes.all).toHaveBeenCalledTimes(1);
  });

  it("is rejected with the error of the backend", async () => {
    await service.sync();
    server.pruneHistory();
    const syncTime = (await getSyncTime(db, "exercises"))!;
    await expect(server.api.exercises.changes(syncTime)).rejects.toEqual(syncTimeExpired());
  });
});

describe("running", () => {
  it("runs a sync requested while one is running once more afterwards", async () => {
    let release!: () => void;
    vi.mocked(server.api.exercises.muscles).mockImplementationOnce(
      () => new Promise((resolve) => (release = () => resolve([{ id: 1, name: "Chest", imageUrl: "chest" }]))),
    );
    const first = service.sync();
    await vi.waitFor(() => expect(release).toBeDefined());
    const second = service.sync();
    const third = service.sync();
    expect(second).toBe(first);
    expect(third).toBe(first);
    release();
    await Promise.all([first, second, third]);
    // the first run and one more for both requests
    expect(server.api.exercises.muscles).toHaveBeenCalledTimes(2);
    expect(status().state).toBe("idle");
  });

  it("debounces local changes and only pulls when the last pull is old", async () => {
    await service.sync();
    const deltas = vi.mocked(server.api.exercises.changes).mock.calls.length;
    await createExercise(input);
    service.scheduleSync();
    service.scheduleSync();
    service.scheduleSync();
    await vi.waitFor(() => expect(server.api.exercises.create).toHaveBeenCalledTimes(1));
    await vi.waitFor(async () => expect(await service.hasUnpushedChanges()).toBe(false));
    // pulled 0 s ago: push only
    expect(server.api.exercises.changes).toHaveBeenCalledTimes(deltas);
  });

  it("pulls once when two tabs sync on the same trigger", async () => {
    await service.sync();
    await setMeta(db, "lastPullDate", new Date(Date.now() - 60_000));
    // two tabs: their own services, one lock shared by the tabs
    const lock = inTabLock();
    const tabA = new SyncService({ db, api: server.api, lock });
    const tabB = new SyncService({ db, api: server.api, lock });
    await Promise.all([tabA.loadDates(), tabB.loadDates()]);
    const pulls = vi.mocked(server.api.exercises.changes).mock.calls.length;

    // e.g. the browser went online: both want to pull if the last pull is older than 15 s
    await Promise.all([tabA.run({ ifOlderThanMs: 15_000 }), tabB.run({ ifOlderThanMs: 15_000 })]);
    expect(server.api.exercises.changes).toHaveBeenCalledTimes(pulls + 1);
    tabA.stop();
    tabB.stop();
  });

  it("pushes the pending changes, false while offline", async () => {
    await service.sync();
    await createExercise(input);
    vi.mocked(server.api.exercises.create).mockRejectedValueOnce(offline());
    expect(await service.pushPendingChanges()).toBe(false);
    expect(await service.pushPendingChanges()).toBe(true);
  });

  it("stops after the session ended and doesn't retry", async () => {
    const { ApiError } = await import("@/lib/api");
    vi.mocked(server.api.exercises.muscles).mockRejectedValueOnce(new ApiError("unauthorized"));
    await service.sync();
    expect(service.halted).toBe("unauthorized");
    expect(status().state).toBe("idle");
    await service.sync();
    expect(server.api.exercises.muscles).toHaveBeenCalledTimes(1);
  });

  it("stops when an update is required", async () => {
    const { ApiError } = await import("@/lib/api");
    vi.mocked(server.api.exercises.muscles).mockRejectedValueOnce(new ApiError("updateRequired", { message: "Update" }));
    await service.sync();
    expect(service.halted).toBe("updateRequired");
    await service.sync();
    expect(server.api.exercises.muscles).toHaveBeenCalledTimes(1);
  });

  it("loads everything again with a resync", async () => {
    await service.sync();
    await service.resync();
    expect(server.api.exercises.all).toHaveBeenCalledTimes(2);
    expect(server.api.workouts.all).toHaveBeenCalledTimes(2);
  });
});

describe("lock", () => {
  it("runs the tasks one after the other", async () => {
    const lock = inTabLock();
    const order: string[] = [];
    const task = (name: string, ms: number) => () =>
      new Promise<void>((resolve) =>
        setTimeout(() => {
          order.push(name);
          resolve();
        }, ms),
      );
    await Promise.all([lock(task("slow", 30)), lock(task("fast", 1)), lock(() => Promise.reject(new Error("x"))).catch(() => {}), lock(task("last", 1))]);
    expect(order).toEqual(["slow", "fast", "last"]);
  });
});
