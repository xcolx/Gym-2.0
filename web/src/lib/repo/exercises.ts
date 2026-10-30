import { addPendingDeletion, type GymDB } from "@/lib/db";
import { newUUID } from "@/lib/uuid";
import type { Exercise, LocalId } from "@/types/models";
import { changedState, getOrThrow, write } from "./write";

/** The fields of a custom exercise that the user enters */
export interface ExerciseInput {
  /** Trimmed, at most 50 characters (EXERCISE_LIMITS) */
  name: string;
  /** Without the name itself and without duplicates (case-insensitive), at most 20 of at most 50 characters */
  aliases: string[];
  /** Trimmed, null if empty, at most 1000 characters */
  exerciseDescription: string | null;
  muscleGroupId: number;
  equipmentId: number;
  primaryMuscleIds: number[];
  /** Without the primary muscles */
  secondaryMuscleIds: number[];
  // At least one has to be tracked
  tracksReps: boolean;
  tracksWeights: boolean;
  tracksTime: boolean;
  tracksIntensity: boolean;
  tracksDistance: boolean;
}

/** The images of an exercise in their order: the uploaded ones followed by the pending ones */
interface ExerciseImages {
  imageUrls: string[];
  pendingImages: Blob[];
}

/**
 * Creates a custom exercise (unverified). `pendingImages` are uploaded together with it by the sync, in their order.
 * Returns the new exercise.
 */
export async function createExercise(input: ExerciseInput, pendingImages: Blob[] = []): Promise<Exercise> {
  const exercise: Exercise = {
    ...input,
    id: newUUID(),
    serverId: null,
    syncState: "created",
    clientUUID: newUUID(),
    imageUrls: [],
    pendingImages,
    verified: false,
  };
  await write(
    (db) => [db.exercises],
    (db) => db.exercises.add(exercise),
  );
  return exercise;
}

/**
 * Changes a custom exercise. The tracked metrics are only changed while it isn't part of a workout (see
 * `exerciseCanChangeTrackedMetrics`), the set data of the workouts depends on them.
 * `images`: the uploaded images to keep (of `exercise.imageUrls`) and the images to upload after them; leave it out to
 * keep the current images.
 */
export async function updateExercise(id: LocalId, input: ExerciseInput, images?: ExerciseImages): Promise<void> {
  await write(
    (db) => [db.exercises, db.workoutExercises],
    async (db) => {
      const exercise = await getOrThrow(db.exercises, id, "exercise");
      const canChangeTrackedMetrics = !exercise.verified && !(await isInUse(db, id));
      const updated: Exercise = {
        ...exercise,
        name: input.name,
        aliases: input.aliases,
        exerciseDescription: input.exerciseDescription,
        muscleGroupId: input.muscleGroupId,
        primaryMuscleIds: input.primaryMuscleIds,
        secondaryMuscleIds: input.secondaryMuscleIds,
        equipmentId: input.equipmentId,
        imageUrls: images?.imageUrls ?? exercise.imageUrls,
        pendingImages: images?.pendingImages ?? exercise.pendingImages,
        syncState: changedState(exercise.syncState),
      };
      if (canChangeTrackedMetrics) {
        updated.tracksReps = input.tracksReps;
        updated.tracksWeights = input.tracksWeights;
        updated.tracksTime = input.tracksTime;
        updated.tracksIntensity = input.tracksIntensity;
        updated.tracksDistance = input.tracksDistance;
      }
      await db.exercises.put(updated);
    },
  );
}

/**
 * Deletes the exercise, also on the server with the next sync. The UI only offers it while the exercise isn't part of
 * a workout (`useExerciseInUse`) or a workout scheme (`useExerciseInScheme`), the server keeps exercises that are.
 * It disappears from the workout schemes, like the nullified relationship on iOS.
 */
export async function deleteExercise(id: LocalId): Promise<void> {
  await write(
    (db) => [db.exercises, db.workoutSchemeExercises, db.pendingDeletions],
    async (db) => {
      const exercise = await getOrThrow(db.exercises, id, "exercise");
      await addPendingDeletion(db, "exercise", exercise.serverId);
      await db.workoutSchemeExercises.where("exerciseId").equals(id).delete();
      await db.exercises.delete(id);
    },
  );
}

async function isInUse(db: GymDB, id: LocalId): Promise<boolean> {
  return (await db.workoutExercises.where("exerciseId").equals(id).count()) > 0;
}
