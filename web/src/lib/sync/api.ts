// The requests the sync makes, tests pass their own implementation instead of the real lib/api services

import { chatApi, exerciseApi, friendApi, userApi, workoutApi, workoutSchemeApi } from "@/lib/api";

export interface SyncApi {
  exercises: Pick<
    typeof exerciseApi,
    "all" | "changes" | "create" | "update" | "delete" | "equipment" | "muscleGroups" | "muscles"
  >;
  workouts: Pick<
    typeof workoutApi,
    "all" | "changes" | "create" | "update" | "delete" | "deleteExercise"
  >;
  schemes: Pick<typeof workoutSchemeApi, "all" | "changes" | "create" | "update" | "markPerformed" | "delete">;
  users: Pick<typeof userApi, "me" | "user" | "updateProfile">;
  friends: Pick<typeof friendApi, "friends" | "blockedUsers">;
  chats: Pick<typeof chatApi, "all" | "changes" | "sendMessage" | "markRead">;
}

export const defaultSyncApi: SyncApi = {
  exercises: exerciseApi,
  workouts: workoutApi,
  schemes: workoutSchemeApi,
  users: userApi,
  friends: friendApi,
  chats: chatApi,
};
