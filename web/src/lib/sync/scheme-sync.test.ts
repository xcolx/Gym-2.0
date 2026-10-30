import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { getPendingDeletions, getPendingSchemePerformances } from "@/lib/db";
import { createScheme, deleteScheme, startWorkoutFromScheme, updateScheme } from "@/lib/repo";
import { notFound, offline, rejected } from "./testing/fake-server";
import { db, localExercise, server, service, setupSyncTest, status } from "./testing/harness";

setupSyncTest();

describe("workout schemes", () => {
  beforeEach(() => service.sync());

  it("creates, updates and deletes a scheme", async () => {
    const bench = (await localExercise("Bench Press"))!;
    const squat = (await localExercise("Squat"))!;
    const scheme = await createScheme("Full Body", [bench.id]);
    await service.sync();
    const serverId = (await db.workoutSchemes.get(scheme.id))!.serverId!;
    expect(server.schemes.get(serverId)).toMatchObject({ name: "Full Body", clientUuid: scheme.clientUUID });

    await updateScheme(scheme.id, "Full Body 2", [squat.id, bench.id]);
    await service.sync();
    expect(server.schemes.get(serverId)!.exercises.map((entry) => entry.exerciseId)).toEqual([squat.serverId, bench.serverId]);
    expect((await db.workoutSchemes.get(scheme.id))?.syncState).toBe("synced");

    await deleteScheme(scheme.id);
    await service.sync();
    expect(server.schemes.has(serverId)).toBe(false);
  });

  it("sets the last performed date of a scheme created offline once it is created", async () => {
    const bench = (await localExercise("Bench Press"))!;
    const scheme = await createScheme("Push", [bench.id]);
    await startWorkoutFromScheme(scheme.id, "Push", [bench.id]);
    expect(await getPendingSchemePerformances(db)).toEqual([scheme.clientUUID]);
    await service.sync();
    const serverId = (await db.workoutSchemes.get(scheme.id))!.serverId!;
    expect(server.api.schemes.markPerformed).toHaveBeenCalledWith(serverId);
    expect(server.schemes.get(serverId)!.lastPerformed).not.toBeNull();
    expect(await getPendingSchemePerformances(db)).toEqual([]);
  });

  it("pulls a scheme changed and deleted on another device", async () => {
    const bench = (await localExercise("Bench Press"))!;
    const scheme = await createScheme("Push", [bench.id]);
    await service.sync();
    const serverId = (await db.workoutSchemes.get(scheme.id))!.serverId!;
    server.changeScheme(serverId, (dto) => (dto.name = "Renamed"));
    await service.sync();
    expect((await db.workoutSchemes.get(scheme.id))?.name).toBe("Renamed");
    server.removeScheme(serverId);
    await service.sync();
    expect(await db.workoutSchemes.get(scheme.id)).toBeUndefined();
    expect(await db.workoutSchemeExercises.where("schemeId").equals(scheme.id).count()).toBe(0);
  });
  it("undoes a rejected update with the server's version", async () => {
    const bench = (await localExercise("Bench Press"))!;
    const scheme = await createScheme("Push", [bench.id]);
    await service.sync();
    await updateScheme(scheme.id, "Not allowed", [bench.id]);
    vi.mocked(server.api.schemes.update).mockRejectedValueOnce(rejected(422, "Invalid"));
    await service.sync();

    expect(status().rejectedChanges[0]).toMatch(/^Your changes to the workout scheme “Not allowed” were undone/);
    expect(await db.workoutSchemes.get(scheme.id)).toMatchObject({ name: "Push", syncState: "synced" });
  });

  it("removes a scheme the server doesn't have anymore with its exercises", async () => {
    const bench = (await localExercise("Bench Press"))!;
    const scheme = await createScheme("Push", [bench.id]);
    await service.sync();
    await updateScheme(scheme.id, "Gone", [bench.id]);
    vi.mocked(server.api.schemes.update).mockRejectedValueOnce(notFound("WorkoutSchemeNotFoundError"));
    await service.sync();

    expect(await db.workoutSchemes.get(scheme.id)).toBeUndefined();
    expect(await db.workoutSchemeExercises.where("schemeId").equals(scheme.id).count()).toBe(0);
    expect(status().rejectedChanges).toEqual(["The workout scheme “Gone” doesn't exist anymore, your changes to it were discarded."]);
  });

  it("keeps a deletion pending while the server can't be reached and forgets one that is already gone", async () => {
    const bench = (await localExercise("Bench Press"))!;
    const scheme = await createScheme("Push", [bench.id]);
    await service.sync();
    const serverId = (await db.workoutSchemes.get(scheme.id))!.serverId!;
    await deleteScheme(scheme.id);

    vi.mocked(server.api.schemes.delete).mockRejectedValueOnce(offline());
    await service.sync();
    expect(status().state).toBe("failed");
    expect(await getPendingDeletions(db)).toEqual([{ kind: "workoutScheme", serverId }]);

    vi.mocked(server.api.schemes.delete).mockRejectedValueOnce(notFound("WorkoutSchemeNotFoundError"));
    await service.sync();
    expect(await getPendingDeletions(db)).toEqual([]);
    expect(status().rejectedChanges).toEqual([]);
  });
});
