// Port of ios/Gym 2.0/Core/Services/WorkoutSchemeService.swift

import { send, sendVoid } from "../client";
import type {
  NewWorkoutScheme,
  WorkoutSchemeDTO,
  WorkoutSchemeDeltaDTO,
  WorkoutSchemeListDTO,
  WorkoutSchemeUpdate,
} from "../dto";

export const workoutSchemeApi = {
  /** All schemes, for the first sync. Use `changes()` with the returned sync time afterwards. */
  all: () => send<WorkoutSchemeListDTO>({ method: "GET", path: "/workout-schemes" }),

  /** The schemes created, updated or deleted since the sync time of the previous `all()` or `changes()`. */
  changes: (syncTime: string) =>
    send<WorkoutSchemeDeltaDTO>({
      method: "GET",
      path: "/workout-schemes/delta",
      query: { last_sync_time: syncTime },
    }),

  create: (scheme: NewWorkoutScheme) =>
    send<WorkoutSchemeDTO>({ method: "POST", path: "/workout-schemes", json: scheme }),

  update: (id: number, update: WorkoutSchemeUpdate) =>
    send<WorkoutSchemeDTO>({ method: "PATCH", path: `/workout-schemes/${id}`, json: update }),

  /** Sets the last performed date to now. Called by the sync for the schemes in `pendingSchemePerformances`. */
  markPerformed: (id: number) =>
    send<WorkoutSchemeDTO>({ method: "POST", path: `/workout-schemes/${id}/performances` }),

  delete: (id: number) => sendVoid({ method: "DELETE", path: `/workout-schemes/${id}` }),
};
