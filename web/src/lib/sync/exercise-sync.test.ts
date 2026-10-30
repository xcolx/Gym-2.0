import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { getPendingDeletions } from "@/lib/db";
import { createExercise, createScheme, deleteExercise, updateExercise, updateScheme } from "@/lib/repo";
import { notFound, offline, rejected } from "./testing/fake-server";
import {
  db,
  input,
  localExercise,
  PNG,
  server,
  serverExercise,
  service,
  setupSyncTest,
  status,
} from "./testing/harness";
import { syncProblems } from "./state";

setupSyncTest();

describe("exercises", () => {
  beforeEach(() => service.sync());

  it("creates an exercise with its client UUID and images, once", async () => {
    const created = await createExercise(input, [new Blob([PNG], { type: "image/png" }), new Blob([PNG, PNG], { type: "image/png" })]);
    await service.sync();

    const dto = serverExercise("Cable Fly")!;
    expect(dto.clientUuid).toBe(created.clientUUID);
    expect(dto.imageUrls).toHaveLength(2);
    const [, images] = vi.mocked(server.api.exercises.create).mock.calls[0];
    expect(images).toEqual([expect.objectContaining({ mimeType: "image/png" }), expect.objectContaining({ mimeType: "image/png" })]);
    expect(await db.exercises.get(created.id)).toMatchObject({ serverId: dto.id, syncState: "synced", pendingImages: [], imageUrls: dto.imageUrls });

    await service.sync();
    expect(server.api.exercises.create).toHaveBeenCalledTimes(1);
    expect([...server.exercises.values()].filter((exercise) => exercise.name === "Cable Fly")).toHaveLength(1);
  });

  it("sends the exercise again without the images if the server rejects them", async () => {
    await createExercise(input, [new Blob([PNG], { type: "image/png" })]);
    vi.mocked(server.api.exercises.create).mockRejectedValueOnce(rejected(422, "Invalid image"));
    await service.sync();
    const calls = vi.mocked(server.api.exercises.create).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[1][1]).toEqual([]);
    expect(serverExercise("Cable Fly")?.imageUrls).toEqual([]);
    expect(await localExercise("Cable Fly")).toMatchObject({ syncState: "synced", pendingImages: [] });
  });

  it("removes uploaded images and appends new ones with an update", async () => {
    const created = await createExercise(input, [new Blob([PNG], { type: "image/png" }), new Blob([PNG, PNG], { type: "image/png" })]);
    await service.sync();
    const [first, second] = (await db.exercises.get(created.id))!.imageUrls;

    await updateExercise(created.id, input, { imageUrls: [second], pendingImages: [new Blob([PNG], { type: "image/png" })] });
    await service.sync();

    const [, draft, images] = vi.mocked(server.api.exercises.update).mock.calls[0];
    expect(draft.imageUrls).toEqual([second]);
    expect(images).toHaveLength(1);
    const dto = serverExercise("Cable Fly")!;
    expect(dto.imageUrls).toHaveLength(2);
    expect(dto.imageUrls[0]).toBe(second);
    expect(dto.imageUrls).not.toContain(first);
    expect(await db.exercises.get(created.id)).toMatchObject({ syncState: "synced", imageUrls: dto.imageUrls, pendingImages: [] });
  });

  it("keeps the images added while the exercise was being sent pending and uploads them with the next sync", async () => {
    const sentImage = new Blob([PNG], { type: "image/png" });
    const addedImage = new Blob([PNG, PNG], { type: "image/png" });
    const created = await createExercise(input, [sentImage]);
    vi.mocked(server.api.exercises.create).mockImplementationOnce(async (draft, images) => {
      // the implementation of the fake server, the one-time implementation is used up
      const dto = await server.api.exercises.create(draft, images);
      await updateExercise(created.id, input, { imageUrls: [], pendingImages: [sentImage, addedImage] });
      return dto;
    });
    await service.sync();

    const uploaded = serverExercise("Cable Fly")!.imageUrls;
    expect(uploaded).toHaveLength(1);
    expect(await db.exercises.get(created.id)).toMatchObject({ syncState: "updated", imageUrls: uploaded, pendingImages: [addedImage] });

    await service.sync();
    const [, draft, images] = vi.mocked(server.api.exercises.update).mock.calls[0];
    expect(draft.imageUrls).toEqual(uploaded);
    expect(images).toHaveLength(1);
    expect(serverExercise("Cable Fly")!.imageUrls).toHaveLength(2);
    expect(await db.exercises.get(created.id)).toMatchObject({ syncState: "synced", pendingImages: [] });
  });

  it("updates and deletes an exercise on the server", async () => {
    const created = await createExercise(input);
    await service.sync();
    await updateExercise(created.id, { ...input, name: "Pec Fly" });
    await service.sync();
    expect(serverExercise("Pec Fly")).toBeDefined();
    expect((await db.exercises.get(created.id))?.syncState).toBe("synced");

    const serverId = (await db.exercises.get(created.id))!.serverId!;
    await deleteExercise(created.id);
    expect(await getPendingDeletions(db)).toEqual([{ kind: "exercise", serverId }]);
    await service.sync();
    expect(server.exercises.has(serverId)).toBe(false);
    expect(await getPendingDeletions(db)).toEqual([]);
  });

  it("pushes a scheme without the exercise before the exercise is deleted", async () => {
    const created = await createExercise(input);
    const scheme = await createScheme("Push", [created.id]);
    await service.sync();
    const serverId = (await db.exercises.get(created.id))!.serverId!;

    await updateScheme(scheme.id, "Push", []);
    await deleteExercise(created.id);
    await service.sync();
    expect(server.exercises.has(serverId)).toBe(false);
    expect(server.schemes.get((await db.workoutSchemes.get(scheme.id))!.serverId!)?.exercises).toEqual([]);
    expect(await getPendingDeletions(db)).toEqual([]);
  });

  it("keeps a change made while the exercise was being sent and pushes it with the next sync", async () => {
    const created = await createExercise(input);
    vi.mocked(server.api.exercises.create).mockImplementationOnce(async (draft) => {
      const dto = server.addExercise({ name: draft.name, clientUuid: draft.clientUuid });
      await updateExercise(created.id, { ...input, name: "Changed meanwhile" });
      return dto;
    });
    await service.sync();
    const local = await db.exercises.get(created.id);
    expect(local).toMatchObject({ name: "Changed meanwhile", syncState: "updated" });
    await service.sync();
    expect(server.exercises.get(local!.serverId!)?.name).toBe("Changed meanwhile");
  });

  it("records the deletion of an exercise that was deleted while it was being created", async () => {
    const created = await createExercise(input);
    vi.mocked(server.api.exercises.create).mockImplementationOnce(async (draft) => {
      const dto = server.addExercise({ name: draft.name, clientUuid: draft.clientUuid });
      await deleteExercise(created.id);
      return dto;
    });
    await service.sync();
    expect(serverExercise("Cable Fly")).toBeUndefined();
    expect(await getPendingDeletions(db)).toEqual([]);
  });

  it("pulls exercises created, changed and deleted on the server", async () => {
    const added = server.addExercise({ name: "Deadlift", verified: true });
    await service.sync();
    expect(await localExercise("Deadlift")).toBeDefined();

    server.changeExercise(added.id, { name: "Romanian Deadlift" });
    await service.sync();
    expect(await localExercise("Romanian Deadlift")).toBeDefined();
    expect(await localExercise("Deadlift")).toBeUndefined();

    server.removeExercise(added.id);
    await service.sync();
    expect(await localExercise("Romanian Deadlift")).toBeUndefined();
  });

  it("doesn't overwrite an exercise with a local change that isn't pushed yet", async () => {
    const created = await createExercise(input);
    await service.sync();
    const serverId = (await db.exercises.get(created.id))!.serverId!;
    server.changeExercise(serverId, { name: "Server name" });
    // changed locally after the push of this sync, before its pull
    vi.mocked(server.api.exercises.changes).mockImplementationOnce(async (syncTime) => {
      await updateExercise(created.id, { ...input, name: "Local name" });
      return server.api.exercises.changes(syncTime);
    });
    await service.sync();
    expect(await db.exercises.get(created.id)).toMatchObject({ name: "Local name", syncState: "updated" });
    // and pushed by the next sync
    await service.sync();
    expect(server.exercises.get(serverId)?.name).toBe("Local name");
  });

  it("keeps a rejected create local, lists it as problem and reports it once", async () => {
    vi.mocked(server.api.exercises.create).mockRejectedValue(rejected(422, "Name too long"));
    const created = await createExercise(input);
    await service.sync();
    await service.sync();

    expect(await db.exercises.get(created.id)).toMatchObject({ serverId: null, syncState: "created" });
    expect(status().rejectedChanges).toEqual(["The exercise “Cable Fly” could not be saved: Name too long"]);
    const problems = syncProblems(status());
    expect(problems).toHaveLength(1);
    expect(problems[0].title).toBe("The exercise “Cable Fly” is not saved");
    expect(await service.pushPendingChanges()).toBe(false);

    service.dismissRejectedChanges();
    expect(status().rejectedChanges).toEqual([]);

    // deleting it locally resolves the problem
    await deleteExercise(created.id);
    await service.sync();
    expect(syncProblems(status())).toEqual([]);
  });

  it("undoes a rejected update with the server's version", async () => {
    const created = await createExercise(input);
    await service.sync();
    await updateExercise(created.id, { ...input, name: "Not allowed" });
    vi.mocked(server.api.exercises.update).mockRejectedValueOnce(rejected(403, "Forbidden"));
    await service.sync();

    expect(status().rejectedChanges[0]).toMatch(/^Your changes to the exercise “Not allowed” were undone/);
    expect(await db.exercises.get(created.id)).toMatchObject({ name: "Cable Fly", syncState: "synced" });
    // restored by a full pull
    expect(server.api.exercises.all).toHaveBeenCalledTimes(2);
  });

  it("removes an exercise the server doesn't have anymore", async () => {
    const created = await createExercise(input);
    await service.sync();
    await updateExercise(created.id, { ...input, name: "Gone" });
    vi.mocked(server.api.exercises.update).mockRejectedValueOnce(notFound("ExerciseNotFoundError"));
    await service.sync();
    expect(await db.exercises.get(created.id)).toBeUndefined();
    expect(status().rejectedChanges).toEqual(["The exercise “Gone” doesn't exist anymore, your changes to it were discarded."]);
  });

  it("restores an exercise whose deletion the server rejects", async () => {
    const created = await createExercise(input);
    await service.sync();
    vi.mocked(server.api.exercises.delete).mockRejectedValueOnce(rejected(409, "In use"));
    await deleteExercise(created.id);
    await service.sync();
    expect(status().rejectedChanges).toEqual(["A deleted exercise was restored, because it could not be deleted: In use"]);
    expect(await getPendingDeletions(db)).toEqual([]);
    expect(await localExercise("Cable Fly")).toBeDefined();
  });

  it("matches a create whose response got lost by its client UUID", async () => {
    const created = await createExercise(input);
    vi.mocked(server.api.exercises.create).mockImplementationOnce(async (draft) => {
      server.addExercise({ name: draft.name, clientUuid: draft.clientUuid });
      throw offline();
    });
    await service.sync();
    expect(status().state).toBe("failed");
    expect(syncProblems(status())[0].id).toBe("syncFailed");

    await service.sync();
    expect(status().state).toBe("idle");
    expect([...server.exercises.values()].filter((exercise) => exercise.name === "Cable Fly")).toHaveLength(1);
    expect(await db.exercises.count()).toBe(3);
    expect((await db.exercises.get(created.id))?.syncState).toBe("synced");
  });
});
