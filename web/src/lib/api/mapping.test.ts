import { describe, expect, it } from "vitest";

import { makeExercise, makeWorkout, makeWorkoutExercise } from "@/test/fixtures";
import type { ExerciseDTO, UserDTO, WorkoutDTO, WorkoutSchemeDTO } from "./dto";
import {
  applySchemeDTO,
  applyWorkoutDTO,
  chatFromDTO,
  exerciseDraft,
  exerciseFromDTO,
  findMatching,
  newSchemeRequest,
  newWorkoutRequest,
  parseServerDate,
  profileUpdate,
  replaceChatMembers,
  serverName,
  userFromDTO,
  workoutExerciseUpdateRequest,
  workoutUpdateRequest,
} from "./mapping";

const exerciseDTO: ExerciseDTO = {
  id: 7,
  clientUuid: "AAAAAAAA-0000-4000-8000-000000000000",
  name: "Squat",
  aliases: ["Back Squat"],
  description: null,
  imageUrls: ["hash-1", "hash-2"],
  muscleGroupId: 2,
  equipmentId: 1,
  verified: true,
  reps: true,
  weights: true,
  time: false,
  intensity: false,
  distance: false,
  primaryMuscleIds: [4],
  secondaryMuscleIds: [],
};

describe("helpers", () => {
  it("makes names the server accepts", () => {
    expect(serverName("  Push  ", "Workout")).toBe("Push");
    expect(serverName("   ", "Workout")).toBe("Workout");
    expect(serverName("x".repeat(30), "Workout")).toHaveLength(25);
  });

  it("parses the dates of the server, also with microseconds", () => {
    expect(parseServerDate("2026-10-15T08:30:00.123456+00:00").toISOString()).toBe("2026-10-15T08:30:00.123Z");
    expect(parseServerDate("2026-10-15T10:30:00+02:00").toISOString()).toBe("2026-10-15T08:30:00.000Z");
    expect(() => parseServerDate("yesterday")).toThrow();
  });

  it("matches by server id first and by client UUID second", () => {
    const pushed = makeWorkout({ serverId: 1, clientUUID: "a" });
    const unpushed = makeWorkout({ serverId: null, clientUUID: "b" });
    expect(findMatching([unpushed, pushed], 1, "b")).toBe(pushed);
    expect(findMatching([unpushed, pushed], 2, "B")).toBe(unpushed);
    expect(findMatching([unpushed, pushed], 2, null)).toBeUndefined();
  });
});

describe("exercises", () => {
  it("creates a synced exercise from the server", () => {
    const exercise = exerciseFromDTO(exerciseDTO);
    expect(exercise).toMatchObject({
      serverId: 7,
      syncState: "synced",
      clientUUID: "aaaaaaaa-0000-4000-8000-000000000000",
      name: "Squat",
      aliases: ["Back Squat"],
      imageUrls: ["hash-1", "hash-2"],
      tracksReps: true,
      tracksTime: false,
      verified: true,
    });
    expect(exercise.id).toBeTruthy();
  });

  it("keeps the local id and pending images of an existing exercise", () => {
    const image = new Blob(["x"]);
    const existing = makeExercise({ id: "local", pendingImages: [image], syncState: "updated" });
    const exercise = exerciseFromDTO({ ...exerciseDTO, clientUuid: null }, existing);
    expect(exercise.id).toBe("local");
    expect(exercise.pendingImages).toEqual([image]);
    expect(exercise.clientUUID).toBe(existing.clientUUID);
    expect(exercise.syncState).toBe("synced");
  });

  it("builds the draft for the server", () => {
    const exercise = makeExercise({ name: "Curl", tracksReps: true, tracksWeights: false, exerciseDescription: "Slow" });
    expect(exerciseDraft(exercise)).toMatchObject({
      clientUuid: exercise.clientUUID,
      name: "Curl",
      description: "Slow",
      reps: true,
      weights: false,
    });
  });
});

describe("workouts", () => {
  const squat = makeExercise({ id: "squat", serverId: 7 });
  const local = makeExercise({ id: "local", serverId: null });
  const workout = makeWorkout({ id: "w", name: "  ", duration: 2000, date: new Date(Date.UTC(2026, 9, 15, 8)) });

  it("builds the create request with consecutive indexes and client UUIDs", () => {
    const second = makeWorkoutExercise({ workoutId: "w", exerciseId: "squat", index: 5, reps: [5], weights: [100] });
    const first = makeWorkoutExercise({ workoutId: "w", exerciseId: "squat", index: 2, reps: [3], weights: [80] });
    const request = newWorkoutRequest(workout, [second, first], new Map([["squat", squat]]));
    expect(request).toMatchObject({
      clientUuid: workout.clientUUID,
      name: "Workout",
      duration: 1440,
      date: "2026-10-15T08:00:00.000Z",
      exercises: [
        { clientUuid: first.clientUUID, exerciseId: 7, index: 0, reps: [3] },
        { clientUuid: second.clientUUID, exerciseId: 7, index: 1, reps: [5] },
      ],
    });
  });

  it("can't build requests while an exercise has no server id", () => {
    const workoutExercise = makeWorkoutExercise({ workoutId: "w", exerciseId: "local" });
    expect(newWorkoutRequest(workout, [workoutExercise], new Map([["local", local]]))).toBeNull();
    expect(workoutExerciseUpdateRequest(workoutExercise, local, 0)).toBeNull();
  });

  it("builds the update request of the workout itself", () => {
    expect(workoutUpdateRequest({ ...workout, inProgress: true })).toEqual({
      name: "Workout",
      date: "2026-10-15T08:00:00.000Z",
      duration: 1440,
      inProgress: true,
    });
  });

  it("applies the server's workout and matches its exercises", () => {
    const run = makeExercise({ id: "run", serverId: 9, tracksReps: false, tracksWeights: false, tracksDistance: true });
    const pushed = makeWorkoutExercise({ id: "pushed", serverId: 100, workoutId: "w", exerciseId: "squat" });
    const lostResponse = makeWorkoutExercise({ id: "lost", serverId: null, clientUUID: "c-1", workoutId: "w", exerciseId: "run" });
    const removedOnServer = makeWorkoutExercise({ id: "removed", serverId: 101, workoutId: "w", exerciseId: "squat" });
    const dto: WorkoutDTO = {
      id: 50,
      clientUuid: workout.clientUUID,
      name: "Legs",
      date: "2026-10-15T08:00:00+00:00",
      duration: 30,
      inProgress: false,
      exercises: [
        { id: 100, clientUuid: null, exerciseId: 7, unilateral: false, index: 0, reps: [5], weights: [100], time: null, intensity: null, distance: null },
        // the server sends a metric the exercise doesn't track as null, a tracked one always as array
        { id: 102, clientUuid: "C-1", exerciseId: 9, unilateral: false, index: 1, reps: null, weights: null, time: null, intensity: null, distance: null },
        { id: 103, clientUuid: null, exerciseId: 999, unilateral: false, index: 2, reps: [1], weights: [1], time: null, intensity: null, distance: null },
      ],
    };
    const applied = applyWorkoutDTO(dto, workout, [pushed, lostResponse, removedOnServer], new Map([[7, squat], [9, run]]));

    expect(applied.workout).toMatchObject({ id: "w", serverId: 50, syncState: "synced", name: "Legs", duration: 30, inProgress: false });
    expect(applied.workoutExercises.map((we) => [we.id, we.serverId, we.index])).toEqual([
      ["pushed", 100, 0],
      ["lost", 102, 1],
    ]);
    expect(applied.workoutExercises[1]).toMatchObject({ reps: null, weights: null, distance: [], syncState: "synced" });
    expect(applied.deletedWorkoutExerciseIds).toEqual(["removed"]);
    expect(applied.complete).toBe(false);
  });
});

describe("workout schemes", () => {
  const a = makeExercise({ id: "a", serverId: 1 });
  const b = makeExercise({ id: "b", serverId: 2 });
  const scheme = { id: "s", serverId: null, syncState: "created" as const, clientUUID: "s-uuid", name: "Pull", lastPerformed: null };

  it("builds the create request in the order of the rows", () => {
    const rows = [
      { id: "r2", schemeId: "s", exerciseId: "b", index: 1 },
      { id: "r1", schemeId: "s", exerciseId: "a", index: 0 },
      { id: "r3", schemeId: "s", exerciseId: null, index: 2 },
    ];
    expect(newSchemeRequest(scheme, rows, new Map([["a", a], ["b", b]]))).toEqual({
      clientUuid: "s-uuid",
      name: "Pull",
      exercises: [
        { exerciseId: 1, index: 0 },
        { exerciseId: 2, index: 1 },
      ],
    });
  });

  it("updates the existing rows in place and deletes extra ones", () => {
    const dto: WorkoutSchemeDTO = {
      id: 3,
      clientUuid: null,
      name: "Pull",
      lastPerformed: "2026-10-15T08:00:00+00:00",
      exercises: [{ id: 30, exerciseId: 2, index: 0 }],
    };
    const rows = [
      { id: "r1", schemeId: "s", exerciseId: "a", index: 0 },
      { id: "r2", schemeId: "s", exerciseId: "b", index: 1 },
    ];
    const applied = applySchemeDTO(dto, scheme, rows, new Map([[1, a], [2, b]]));
    expect(applied.scheme).toMatchObject({ id: "s", serverId: 3, syncState: "synced", clientUUID: "s-uuid" });
    expect(applied.scheme.lastPerformed?.toISOString()).toBe("2026-10-15T08:00:00.000Z");
    expect(applied.rows).toEqual([{ id: "r1", schemeId: "s", exerciseId: "b", index: 0 }]);
    expect(applied.deletedRowIds).toEqual(["r2"]);
    expect(applied.complete).toBe(true);
  });
});

describe("users and chats", () => {
  const dto: UserDTO = {
    id: 1,
    username: "colin",
    email: "c@example.com",
    profileImageUrl: "",
    profileIconUrl: "",
    bodyweight: 80,
    schemeColor: "#00FF00",
    weightUnit: 1,
    distanceUnit: 0,
    language: "en",
    createdAt: "2024-07-28T10:00:00+00:00",
  };

  it("keeps settings that weren't pushed yet", () => {
    const existing = { ...userFromDTO(dto), isCurrentUser: true, bodyweight: 75, syncState: "updated" as const };
    const kept = userFromDTO({ ...dto, username: "new" }, existing, false);
    expect(kept).toMatchObject({ username: "new", bodyweight: 75, syncState: "updated", isCurrentUser: true });
    const overwritten = userFromDTO(dto, existing, true);
    expect(overwritten).toMatchObject({ bodyweight: 80, syncState: "synced" });
    expect(profileUpdate(overwritten)).toEqual({ bodyweight: 80, schemeColor: "#00FF00", weightUnit: 1, distanceUnit: 0 });
  });

  it("keeps the local input of a chat and only returns changed members", () => {
    const chat = chatFromDTO(
      {
        id: 4,
        groupChat: true,
        name: "Gym",
        imageUrl: null,
        createdAt: "2026-10-01T08:00:00+00:00",
        createdBy: 1,
        public: true,
        latestMessageTimestamp: null,
        latestMessagePreview: null,
        latestMessageSenderId: null,
        members: [],
        messages: [],
      },
      {
        serverId: 4,
        groupChat: true,
        name: null,
        imageUrl: null,
        createdAt: new Date(),
        createdById: null,
        isPublic: false,
        latestMessageTimestamp: null,
        latestMessagePreview: null,
        latestMessageSenderId: null,
        input: "Hi",
        inputUUID: "u",
      },
    );
    expect(chat).toMatchObject({ serverId: 4, groupChat: true, isPublic: true, input: "Hi", inputUUID: "u" });

    const members = replaceChatMembers(
      4,
      [
        { userId: 1, lastReadMessageId: 10, admin: null },
        { userId: 3, lastReadMessageId: 0, admin: null },
      ],
      [
        { chatId: 4, userId: 1, lastReadMessageId: 10, admin: null },
        { chatId: 4, userId: 2, lastReadMessageId: 5, admin: null },
      ],
    );
    expect(members).toEqual({ put: [{ chatId: 4, userId: 3, lastReadMessageId: 0, admin: null }], deletedUserIds: [2] });
  });

  it("writes members whose admin status changed", () => {
    const members = replaceChatMembers(
      4,
      [
        { userId: 1, lastReadMessageId: 10, admin: true },
        { userId: 2, lastReadMessageId: 5, admin: false },
      ],
      [
        { chatId: 4, userId: 1, lastReadMessageId: 10, admin: false },
        { chatId: 4, userId: 2, lastReadMessageId: 5, admin: false },
      ],
    );
    expect(members).toEqual({ put: [{ chatId: 4, userId: 1, lastReadMessageId: 10, admin: true }], deletedUserIds: [] });
  });
});
