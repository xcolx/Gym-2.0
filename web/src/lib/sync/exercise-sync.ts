// New images of an exercise are kept in `pendingImages` until the server accepted them, then they are uploaded images
// (`imageUrls`). Exercises are pulled before the schemes and workouts, which reference them.

import {
  ChangeAction,
  detectImageUpload,
  errorMessage,
  errorStatus,
  exerciseDraft,
  exerciseFromDTO,
  findMatching,
  isRejection,
  type ExerciseDTO,
  type ExerciseDeltaDTO,
  type ExerciseDraft,
  type ImageUpload,
} from "@/lib/api";
import { addPendingDeletion, getSyncTime, setSyncTime } from "@/lib/db";
import type { Exercise, LocalId } from "@/types/models";
import { loadDelta, sameJSON, type SyncContext } from "./context";
import { imagesSignature, startsWithImages } from "./images";
import { logSync } from "./log";
import { deleteLocally, didReject } from "./rejections";

export class ExerciseSync {
  constructor(private readonly ctx: SyncContext) {}

  private get db() {
    return this.ctx.db;
  }

  private get api() {
    return this.ctx.api;
  }

  // MARK: - Push

  async push(): Promise<void> {
    const pending = await this.db.exercises.where("syncState").notEqual("synced").toArray();
    for (const exercise of pending) {
      this.ctx.ensureRunning();
      const sent = exerciseDraft(exercise);
      const sentImages = exercise.pendingImages;
      try {
        const serverId = exercise.serverId;
        const { dto, uploaded } =
          serverId !== null
            ? await this.send(sent, sentImages, (draft, images) => this.api.exercises.update(serverId, draft, images))
            : await this.send(sent, sentImages, (draft, images) => this.api.exercises.create(draft, images));
        await this.didPush(exercise.id, serverId === null, sent, sentImages, uploaded, dto);
      } catch (error) {
        if (!isRejection(error)) throw error;
        const current = await this.db.exercises.get(exercise.id);
        if (!current) continue;
        await didReject(this.ctx, { type: "exercise", row: current }, error);
      }
    }
  }

  /**
   * Sends the exercise with its new images, the ones that aren't an image the server takes are left out. If the
   * server rejects it with the images, it's sent again without them. `uploaded`: how many new images the server
   * received, they are the last of `dto.imageUrls`.
   */
  private async send(
    draft: ExerciseDraft,
    images: readonly Blob[],
    send: (draft: ExerciseDraft, images: ImageUpload[]) => Promise<ExerciseDTO>,
  ): Promise<{ dto: ExerciseDTO; uploaded: number }> {
    const uploads = (await Promise.all(images.map(detectImageUpload))).filter((upload) => upload !== null);
    if (uploads.length === 0) return { dto: await send(draft, []), uploaded: 0 };
    try {
      return { dto: await send(draft, uploads), uploaded: uploads.length };
    } catch (error) {
      if (!isRejection(error) || errorStatus(error) === 404) throw error;
      logSync.error(`The server rejected the images of the exercise ${draft.name}: ${errorMessage(error)}`);
      return { dto: await send(draft, []), uploaded: 0 };
    }
  }

  /**
   * The sent pending images are uploaded images now (or were rejected by the server), the images added since stay
   * pending. If the pending images were changed otherwise in the meantime, all of them are sent again.
   */
  private async didPush(
    id: LocalId,
    wasCreate: boolean,
    sent: ExerciseDraft,
    sentImages: readonly Blob[],
    uploaded: number,
    dto: ExerciseDTO,
  ): Promise<void> {
    // The images are compared before the transaction, reading a Blob isn't a Dexie call
    const before = await this.db.exercises.get(id);
    const imagesKept = before ? await startsWithImages(before.pendingImages, sentImages) : false;
    const uploadedUrls = uploaded > 0 ? dto.imageUrls.slice(-uploaded) : [];
    await this.ctx.transaction(async () => {
      const exercise = await this.db.exercises.get(id);
      if (!exercise) {
        // Deleted while it was being created (the deletion of an exercise with a server id is pending already)
        if (wasCreate) await addPendingDeletion(this.db, "exercise", dto.id);
        return;
      }
      // Other images between the comparison and now count as a change as well
      const imagesKeptNow = imagesKept && imagesSignature(exercise.pendingImages) === imagesSignature(before?.pendingImages);
      if (sameJSON(exerciseDraft(exercise), sent) && imagesKeptNow && exercise.pendingImages.length === sentImages.length) {
        await this.db.exercises.put(exerciseFromDTO(dto, { ...exercise, pendingImages: [] }));
      } else {
        // Changed again while it was being sent
        await this.db.exercises.put({
          ...exercise,
          serverId: dto.id,
          ...(imagesKeptNow && {
            imageUrls: [...exercise.imageUrls, ...uploadedUrls],
            pendingImages: exercise.pendingImages.slice(sentImages.length),
          }),
          syncState: "updated",
        });
      }
    });
  }

  // MARK: - Pull

  async pull(): Promise<void> {
    const syncTime = await getSyncTime(this.db, "exercises");
    if (syncTime) {
      const delta = await loadDelta<ExerciseDeltaDTO>(() => this.api.exercises.changes(syncTime));
      if (delta) {
        await this.ctx.transaction(async () => {
          const local = await this.db.exercises.toArray();
          for (const change of delta.updates) {
            const match = findMatching(local, change.id, change.clientUuid);
            if (change.action === ChangeAction.deleted) {
              if (match && match.syncState === "synced") {
                await deleteLocally(this.ctx, "exercise", match.id);
                local.splice(local.indexOf(match), 1);
              }
            } else {
              await this.upsert(change, match, local);
            }
          }
          await setSyncTime(this.db, "exercises", delta.syncTime);
        });
        return;
      }
    }

    const list = await this.api.exercises.all();
    await this.ctx.transaction(async () => {
      const local = await this.db.exercises.toArray();
      const kept = new Set<LocalId>();
      for (const dto of list.exercises) {
        kept.add((await this.upsert(dto, findMatching(local, dto.id, dto.clientUuid), local)).id);
      }
      for (const exercise of [...local]) {
        if (exercise.syncState === "synced" && !kept.has(exercise.id)) await deleteLocally(this.ctx, "exercise", exercise.id);
      }
      await setSyncTime(this.db, "exercises", list.syncTime);
    });
  }

  /** Inside a transaction. `local` is kept up to date for the following matches. */
  private async upsert(dto: ExerciseDTO, match: Exercise | undefined, local: Exercise[]): Promise<Exercise> {
    if (!match) {
      const exercise = exerciseFromDTO(dto);
      await this.db.exercises.add(exercise);
      local.push(exercise);
      return exercise;
    }
    let updated: Exercise;
    if (match.syncState === "synced") {
      updated = exerciseFromDTO(dto, match);
    } else if (match.serverId === null) {
      // Created, but the response got lost. The local changes are sent as an update.
      updated = { ...match, serverId: dto.id, syncState: "updated" };
    } else {
      return match;
    }
    await this.db.exercises.put(updated);
    local[local.indexOf(match)] = updated;
    return updated;
  }
}
