import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { getPendingDeletions } from "@/lib/db";
import {
  addExercisesToWorkout,
  createExercise,
  deleteWorkout,
  finishWorkout,
  removeExerciseFromWorkout,
  setSetValue,
  startWorkout,
  updateExercise,
  workoutWithExercises,
} from "@/lib/repo";
import { rejected } from "./testing/fake-server";
import { db, input, localExercise, server, serverExercise, service, setupSyncTest, status } from "./testing/harness";
import { syncProblems } from "./state";

setupSyncTest();

describe("workouts", () => {
  beforeEach(() => service.sync());

  const bench = async () => (await localExercise("Bench Press"))!;

  it("pushes a workout in progress, its sets and the finish", async () => {
    const workout = await startWorkout("Push", [(await bench()).id]);
    await service.sync();
    const local = (await workoutWithExercises(db, workout.id))!;
    const dto = server.workouts.get(local.serverId!)!;
    expect(dto).toMatchObject({ name: "Push", inProgress: true, clientUuid: workout.clientUUID });
    expect(dto.exercises).toHaveLength(1);
    expect(local.workoutExercises[0]).toMatchObject({ serverId: dto.exercises[0].id, syncState: "synced" });

    await setSetValue(local.workoutExercises[0].id, "reps", 0, 8);
    await service.sync();
    // one request with only the changed exercise, the workout itself is unchanged
    expect(server.api.workouts.update).toHaveBeenCalledTimes(1);
    expect(vi.mocked(server.api.workouts.update).mock.calls[0]).toEqual([
      local.serverId,
      { exerciseChanges: [expect.objectContaining({ op: "update", id: dto.exercises[0].id, index: 0, reps: [8] })] },
    ]);
    expect(server.workouts.get(local.serverId!)!.exercises[0].reps).toEqual([8]);

    await finishWorkout(workout.id);
    await service.sync();
    expect(server.workouts.get(local.serverId!)!.inProgress).toBe(false);
    expect((await db.workouts.get(workout.id))?.syncState).toBe("synced");
  });

  it("adds and removes exercises of a pushed workout in the local order", async () => {
    const squat = (await localExercise("Squat"))!;
    const workout = await startWorkout("Legs", [(await bench()).id]);
    await service.sync();
    await addExercisesToWorkout(workout.id, [squat.id]);
    await service.sync();
    const serverId = (await db.workouts.get(workout.id))!.serverId!;
    expect(server.workouts.get(serverId)!.exercises.map((entry) => entry.index)).toEqual([0, 1]);
    const [added] = vi.mocked(server.api.workouts.update).mock.calls[0][1].exerciseChanges!;
    expect(added).toMatchObject({ op: "create", index: 1 });
    expect(added.op === "create" && added.clientUuid).toBeTruthy();

    const first = (await workoutWithExercises(db, workout.id))!.workoutExercises[0];
    await removeExerciseFromWorkout(first.id);
    await service.sync();
    expect(server.api.workouts.deleteExercise).toHaveBeenCalledWith(first.serverId);
    expect(server.workouts.get(serverId)!.exercises.map((entry) => entry.exerciseId)).toEqual([squat.serverId]);
  });

  it("pushes the workout and all changes of its exercises with one request", async () => {
    const squat = (await localExercise("Squat"))!;
    server.addExercise({ name: "Deadlift", verified: true });
    const workout = await startWorkout("Legs", [(await bench()).id, squat.id]);
    await service.sync();
    const serverId = (await db.workouts.get(workout.id))!.serverId!;
    const [benchRow, squatRow] = (await workoutWithExercises(db, workout.id))!.workoutExercises;
    // a new exercise between the two, both changed, and the workout finished
    await addExercisesToWorkout(workout.id, [(await localExercise("Deadlift"))!.id]);
    const added = (await workoutWithExercises(db, workout.id))!.workoutExercises[2];
    await db.workoutExercises.update(added.id, { index: 1 });
    await db.workoutExercises.update(squatRow.id, { index: 2 });
    await setSetValue(benchRow.id, "reps", 0, 5);
    await setSetValue(squatRow.id, "reps", 0, 3);
    await setSetValue(added.id, "reps", 0, 1);
    await finishWorkout(workout.id);
    vi.mocked(server.api.workouts.update).mockClear();
    await service.sync();

    expect(server.api.workouts.update).toHaveBeenCalledTimes(1);
    const sent = vi.mocked(server.api.workouts.update).mock.calls[0][1];
    expect(sent).toMatchObject({ name: "Legs", inProgress: false });
    expect(sent.exerciseChanges!.map((change) => [change.op, change.index])).toEqual([
      ["update", 0],
      ["create", 1],
      ["update", 2],
    ]);
    const dto = server.workouts.get(serverId)!;
    expect(dto.inProgress).toBe(false);
    expect(dto.exercises.map((entry) => [entry.index, entry.reps?.[0]])).toEqual([
      [0, 5],
      [1, 1],
      [2, 3],
    ]);
    const local = (await workoutWithExercises(db, workout.id))!;
    expect(local.syncState).toBe("synced");
    expect(local.workoutExercises.map((row) => [row.serverId, row.syncState])).toEqual(
      dto.exercises.map((entry) => [entry.id, "synced"]),
    );
  });

  it("records the deletion of an exercise removed while it was being added", async () => {
    const workout = await startWorkout("Legs", [(await bench()).id]);
    await service.sync();
    const serverId = (await db.workouts.get(workout.id))!.serverId!;
    await addExercisesToWorkout(workout.id, [(await localExercise("Squat"))!.id]);
    const added = (await workoutWithExercises(db, workout.id))!.workoutExercises[1];
    const update = vi.mocked(server.api.workouts.update);
    const accept = update.getMockImplementation()!;
    update.mockImplementationOnce(async (id, request) => {
      await removeExerciseFromWorkout(added.id);
      return accept(id, request);
    });
    await service.sync();
    expect(server.workouts.get(serverId)!.exercises.map((entry) => entry.exerciseId)).toEqual([(await bench()).serverId]);
    expect(await getPendingDeletions(db)).toEqual([]);
  });

  it("saves none of the changes when the server rejects one of them", async () => {
    const workout = await startWorkout("Legs", [(await bench()).id]);
    await service.sync();
    const serverId = (await db.workouts.get(workout.id))!.serverId!;
    const before = structuredClone(server.workouts.get(serverId)!);
    const squat = serverExercise("Squat")!;
    const draft = { clientUuid: "u", unilateral: false, reps: [1], weights: [1], time: null, intensity: null, distance: null };
    await expect(
      server.api.workouts.update(serverId, {
        name: "Changed",
        exerciseChanges: [
          { op: "create", exerciseId: squat.id, index: 1, ...draft },
          { op: "update", id: 999_999, reps: [2] },
        ],
      }),
    ).rejects.toMatchObject({ code: "WorkoutExerciseNotFoundError" });
    expect(server.workouts.get(serverId)).toEqual(before);
  });

  it("continues a workout changed on another device and closes it when it was finished there", async () => {
    const workout = await startWorkout("Push", [(await bench()).id]);
    await service.sync();
    const serverId = (await db.workouts.get(workout.id))!.serverId!;

    server.changeWorkout(serverId, (dto) => {
      dto.exercises[0].reps = [10, 12];
      dto.exercises[0].weights = [60, 60];
    });
    await service.sync();
    expect((await workoutWithExercises(db, workout.id))!.workoutExercises[0]).toMatchObject({ reps: [10, 12], weights: [60, 60] });

    server.changeWorkout(serverId, (dto) => {
      dto.inProgress = false;
      dto.duration = 45;
    });
    await service.sync();
    expect(await db.workouts.get(workout.id)).toMatchObject({ inProgress: false, duration: 45, syncState: "synced" });
  });

  it("pulls a workout in progress started on another device and removes one deleted there", async () => {
    const benchDTO = serverExercise("Bench Press")!;
    const created = await server.api.workouts.create({
      clientUuid: "4b3a1c2d-0000-4000-8000-000000000001",
      name: "Other device",
      date: "2026-10-15T08:00:00.000Z",
      duration: 0,
      inProgress: true,
      exercises: [{ clientUuid: null, exerciseId: benchDTO.id, unilateral: false, index: 0, reps: [5], weights: [100], time: null, intensity: null, distance: null }],
    });
    await service.sync();
    const local = (await db.workouts.filter((workout) => workout.serverId === created.id).first())!;
    expect(local).toMatchObject({ name: "Other device", inProgress: true });
    expect((await workoutWithExercises(db, local.id))!.workoutExercises[0]).toMatchObject({ reps: [5], weights: [100] });

    server.removeWorkout(created.id);
    await service.sync();
    expect(await db.workouts.get(local.id)).toBeUndefined();
    expect(await db.workoutExercises.where("workoutId").equals(local.id).count()).toBe(0);
  });

  it("doesn't overwrite a workout whose exercises have unpushed changes", async () => {
    const workout = await startWorkout("Push", [(await bench()).id]);
    await service.sync();
    const serverId = (await db.workouts.get(workout.id))!.serverId!;
    const workoutExercise = (await workoutWithExercises(db, workout.id))!.workoutExercises[0];
    server.changeWorkout(serverId, (dto) => (dto.name = "Server name"));
    vi.mocked(server.api.workouts.changes).mockImplementationOnce(async (syncTime) => {
      await setSetValue(workoutExercise.id, "reps", 0, 3);
      return server.api.workouts.changes(syncTime);
    });
    await service.sync();
    expect(await db.workouts.get(workout.id)).toMatchObject({ name: "Push" });
    expect(await db.workoutExercises.get(workoutExercise.id)).toMatchObject({ reps: [3], syncState: "updated" });
  });

  it("deletes a workout on the server, also one deleted while it was being created", async () => {
    const workout = await startWorkout("Push", [(await bench()).id]);
    await service.sync();
    const serverId = (await db.workouts.get(workout.id))!.serverId!;
    await deleteWorkout(workout.id);
    await service.sync();
    expect(server.workouts.has(serverId)).toBe(false);

    const second = await startWorkout("Pull", [(await bench()).id]);
    vi.mocked(server.api.workouts.create).mockImplementationOnce(async (request) => {
      await deleteWorkout(second.id);
      return server.api.workouts.create(request);
    });
    await service.sync();
    expect(server.workouts.size).toBe(0);
    expect(await getPendingDeletions(db)).toEqual([]);
  });

  it("restores a workout whose update the server rejected", async () => {
    const workout = await startWorkout("Push", [(await bench()).id]);
    await setSetValue((await workoutWithExercises(db, workout.id))!.workoutExercises[0].id, "reps", 0, 5);
    await service.sync();
    await finishWorkout(workout.id);
    vi.mocked(server.api.workouts.update).mockRejectedValueOnce(rejected(422, "Invalid duration"));
    await service.sync();
    expect(status().rejectedChanges[0]).toMatch(/^Your changes to the workout “Push” were undone/);
    expect(await db.workouts.get(workout.id)).toMatchObject({ inProgress: true, syncState: "synced" });
  });
});

describe("workouts with exercises that can't be pushed", () => {
  beforeEach(() => service.sync());

  const bench = async () => (await localExercise("Bench Press"))!;
  const pushedFly = async () => {
    const fly = await createExercise(input);
    await service.sync();
    return (await db.exercises.get(fly.id))!;
  };
  const serverWorkout = async (id: string) => server.workouts.get((await db.workouts.get(id))!.serverId!)!;

  it("creates a workout without the exercise that was deleted on another device", async () => {
    const fly = await pushedFly();
    const workout = await startWorkout("Push", [(await bench()).id, fly.id]);
    const [benchRow] = (await workoutWithExercises(db, workout.id))!.workoutExercises;
    await setSetValue(benchRow.id, "reps", 0, 8);
    // deleted on another device before this device could push the workout
    server.removeExercise(fly.serverId!);

    // a push without pull: the 404 makes the same sync load the exercises and remove it, then push again
    expect(await service.pushPendingChanges()).toBe(true);
    const dto = await serverWorkout(workout.id);
    expect(dto.exercises.map((entry) => [entry.exerciseId, entry.index, entry.reps])).toEqual([[benchRow.exercise!.serverId, 0, [8]]]);
    const local = (await workoutWithExercises(db, workout.id))!;
    expect(local).toMatchObject({ syncState: "synced" });
    expect(local.workoutExercises.map((row) => [row.exercise?.name, row.index, row.syncState])).toEqual([["Bench Press", 0, "synced"]]);
    expect(status().rejectedChanges).toContain(
      "An exercise of the workout “Push” was deleted on another device. Its sets were removed from the workout, they can't be saved without it.",
    );
    expect(syncProblems(status())).toEqual([]);
  });

  it("pushes the other exercises of a workout whose new exercise was deleted on another device", async () => {
    const fly = await pushedFly();
    const workout = await startWorkout("Push", [(await bench()).id]);
    await service.sync();
    await addExercisesToWorkout(workout.id, [fly.id, (await localExercise("Squat"))!.id]);
    const [benchRow, flyRow, squatRow] = (await workoutWithExercises(db, workout.id))!.workoutExercises;
    await setSetValue(benchRow.id, "reps", 0, 5);
    await setSetValue(flyRow.id, "reps", 0, 12);
    await setSetValue(squatRow.id, "reps", 0, 3);
    await finishWorkout(workout.id);
    server.removeExercise(fly.serverId!);

    expect(await service.pushPendingChanges()).toBe(true);
    const dto = await serverWorkout(workout.id);
    expect(dto.inProgress).toBe(false);
    expect(dto.exercises.map((entry) => [entry.index, entry.reps])).toEqual([
      [0, [5]],
      [1, [3]],
    ]);
    const local = (await workoutWithExercises(db, workout.id))!.workoutExercises;
    expect(local.map((row) => [row.exercise?.name, row.index])).toEqual([
      ["Bench Press", 0],
      ["Squat", 1],
    ]);
  });

  it("removes a row nullified by the pull and pushes the rest of the workout", async () => {
    const fly = await pushedFly();
    const workout = await startWorkout("Push", [fly.id, (await bench()).id]);
    // the exercise is gone locally already (the pull of a sync that couldn't push, like SwiftData's nullify)
    await db.workoutExercises.where("workoutId").equals(workout.id).modify((row) => {
      if (row.exerciseId === fly.id) row.exerciseId = null;
    });
    await service.sync();
    const dto = await serverWorkout(workout.id);
    expect(dto.exercises.map((entry) => [entry.exerciseId, entry.index])).toEqual([[(await bench()).serverId, 0]]);
    expect(await service.hasUnpushedChanges()).toBe(false);
  });

  it("lists a workout as problem while an exercise of it could not be saved", async () => {
    const create = vi.mocked(server.api.exercises.create);
    const accept = create.getMockImplementation()!;
    create.mockRejectedValue(rejected(422, "Name too long"));
    const fly = await createExercise(input);
    const workout = await startWorkout("Push", [(await bench()).id, fly.id]);
    await service.sync();

    expect(server.api.workouts.create).not.toHaveBeenCalled();
    const problems = syncProblems(status());
    expect(problems.map((problem) => problem.title).sort()).toEqual([
      "The exercise “Cable Fly” is not saved",
      "The workout “Push” is not saved",
    ]);
    expect(problems.find((problem) => problem.title.startsWith("The workout"))?.message).toMatch(
      /^It contains the exercise “Cable Fly”, which could not be saved/,
    );
    expect(await service.pushPendingChanges()).toBe(false);

    // the exercise is saved after a change: the workout follows
    create.mockImplementation(accept);
    await updateExercise(fly.id, { ...input, name: "Fly" });
    await service.sync();
    expect((await serverWorkout(workout.id)).exercises).toHaveLength(2);
    expect(syncProblems(status())).toEqual([]);
  });

  it("pushes the other exercises of a pushed workout while one waits for its exercise", async () => {
    const workout = await startWorkout("Push", [(await bench()).id]);
    await service.sync();
    vi.mocked(server.api.exercises.create).mockRejectedValue(rejected(422, "Name too long"));
    const fly = await createExercise(input);
    await addExercisesToWorkout(workout.id, [fly.id]);
    const [benchRow, flyRow] = (await workoutWithExercises(db, workout.id))!.workoutExercises;
    await setSetValue(benchRow.id, "reps", 0, 6);
    await setSetValue(flyRow.id, "reps", 0, 12);
    await finishWorkout(workout.id);
    await service.sync();

    const dto = await serverWorkout(workout.id);
    expect(dto).toMatchObject({ inProgress: false });
    expect(dto.exercises.map((entry) => entry.reps)).toEqual([[6]]);
    expect(await db.workouts.get(workout.id)).toMatchObject({ syncState: "synced" });
    expect(await db.workoutExercises.get(flyRow.id)).toMatchObject({ serverId: null, syncState: "created" });
    expect(syncProblems(status()).map((problem) => problem.title)).toContain("The workout “Push” is not saved");
  });
});
