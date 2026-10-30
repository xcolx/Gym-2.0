// `db`, `server` and `service` are live bindings, set before each test by `setupSyncTest()`

import "fake-indexeddb/auto";

import { afterEach, beforeEach, vi } from "vitest";

import { deleteUserDb, openUserDb, type GymDB } from "@/lib/db";
import type { ExerciseInput } from "@/lib/repo";
import { SyncService } from "../sync-service";
import { FakeServer } from "./fake-server";

export const USER_ID = 42;
export let db: GymDB;
export let server: FakeServer;
export let service: SyncService;

/** Registers the beforeEach and afterEach of the sync tests. Call it at the top level of the test file. */
export function setupSyncTest(): void {
  beforeEach(async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    db = (await openUserDb(USER_ID))!;
    server = new FakeServer();
    service = new SyncService({ db, api: server.api, pushDelayMs: 10, pullIntervalMs: 60_000 });
  });

  afterEach(async () => {
    service.stop();
    await deleteUserDb(USER_ID);
    vi.restoreAllMocks();
  });
}

export const input: ExerciseInput = {
  name: "Cable Fly",
  aliases: ["Fly"],
  exerciseDescription: null,
  muscleGroupId: 1,
  equipmentId: 1,
  primaryMuscleIds: [1],
  secondaryMuscleIds: [],
  tracksReps: true,
  tracksWeights: true,
  tracksTime: false,
  tracksIntensity: false,
  tracksDistance: false,
};

export const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

export const localExercise = (name: string) => db.exercises.filter((exercise) => exercise.name === name).first();
export const serverExercise = (name: string) => [...server.exercises.values()].find((exercise) => exercise.name === name);
export const status = () => service.store.get();
