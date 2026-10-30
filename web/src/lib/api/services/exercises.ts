// Port of ios/Gym 2.0/Core/Services/ExerciseService.swift

import { formData, send, sendVoid, type ImageUpload } from "../client";
import type {
  EquipmentDTO,
  ExerciseDTO,
  ExerciseDeltaDTO,
  ExerciseDraft,
  ExerciseListDTO,
  MuscleDTO,
  MuscleGroupDTO,
} from "../dto";

function exerciseForm(draft: ExerciseDraft, images: readonly ImageUpload[], isUpdate: boolean): FormData {
  return formData(
    {
      client_uuid: draft.clientUuid,
      name: draft.name,
      aliases: draft.aliases,
      description: draft.description,
      image_urls: isUpdate ? draft.imageUrls : null,
      muscle_group_id: draft.muscleGroupId,
      equipment_id: draft.equipmentId,
      primary_muscle_ids: draft.primaryMuscleIds,
      secondary_muscle_ids: draft.secondaryMuscleIds,
      reps: draft.reps,
      weights: draft.weights,
      time: draft.time,
      intensity: draft.intensity,
      distance: draft.distance,
    },
    { images },
  );
}

export const exerciseApi = {
  /** All exercises, for the first sync. Use `changes()` with the returned sync time afterwards. */
  all: () => send<ExerciseListDTO>({ method: "GET", path: "/exercises" }),

  /** The exercises created, updated or deleted since the sync time of the previous `all()` or `changes()`. */
  changes: (syncTime: string) =>
    send<ExerciseDeltaDTO>({ method: "GET", path: "/exercises/delta", query: { last_sync_time: syncTime } }),

  /** At most MAX_EXERCISE_IMAGES images, shown in this order. */
  create: (draft: ExerciseDraft, images: readonly ImageUpload[] = []) =>
    send<ExerciseDTO>({ method: "POST", path: "/exercises", form: exerciseForm(draft, images, false) }),

  /**
   * Replaces all fields of the exercise (the client UUID is ignored). The images become the uploaded ones listed in
   * `draft.imageUrls` followed by the new `images`.
   */
  update: (id: number, draft: ExerciseDraft, images: readonly ImageUpload[] = []) =>
    send<ExerciseDTO>({ method: "PUT", path: `/exercises/${id}`, form: exerciseForm(draft, images, true) }),

  delete: (id: number) => sendVoid({ method: "DELETE", path: `/exercises/${id}` }),

  equipment: () => send<EquipmentDTO[]>({ method: "GET", path: "/exercises/equipment" }),

  muscleGroups: () => send<MuscleGroupDTO[]>({ method: "GET", path: "/exercises/muscle-groups" }),

  muscles: () => send<MuscleDTO[]>({ method: "GET", path: "/exercises/muscles" }),
};
