// Port of ios/Gym 2.0/Core/Services/WorkoutService.swift

import { send, sendVoid } from "../client";
import type { NewWorkout, WorkoutDTO, WorkoutDeltaDTO, WorkoutListDTO, WorkoutUpdate } from "../dto";

export const workoutApi = {
  /** All workouts, for the first sync. Use `changes()` with the returned sync time afterwards. */
  all: () => send<WorkoutListDTO>({ method: "GET", path: "/workouts" }),

  /** The workouts created, updated or deleted since the sync time of the previous `all()` or `changes()`. */
  changes: (syncTime: string) =>
    send<WorkoutDeltaDTO>({ method: "GET", path: "/workouts/delta", query: { last_sync_time: syncTime } }),

  create: (workout: NewWorkout) => send<WorkoutDTO>({ method: "POST", path: "/workouts", json: workout }),

  /**
   * Changes the workout and creates or updates its exercises (`update.exerciseChanges`) in one request. Atomic: if one
   * change fails, nothing is changed. Returns the workout with all its exercises, the created ones can be found by their
   * client UUID.
   */
  update: (id: number, update: WorkoutUpdate) =>
    send<WorkoutDTO>({ method: "PATCH", path: `/workouts/${id}`, json: update }),

  delete: (id: number) => sendVoid({ method: "DELETE", path: `/workouts/${id}` }),

  /** Removes the exercise from its workout. The following exercises move up by one. */
  deleteExercise: (id: number) => sendVoid({ method: "DELETE", path: `/workout-exercises/${id}` }),
};
