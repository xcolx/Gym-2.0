import {
  applySchemeDTO,
  errorMessage,
  findMatching,
  isRejection,
  newSchemeRequest,
  parseOptionalServerDate,
  schemeOfChange,
  schemeUpdateRequest,
  type WorkoutSchemeDTO,
  type WorkoutSchemeDeltaDTO,
} from "@/lib/api";
import {
  addPendingDeletion,
  getPendingSchemePerformances,
  getSyncTime,
  removePendingSchemePerformance,
  setSyncTime,
} from "@/lib/db";
import { exercisesById } from "@/lib/repo/queries";
import type { LocalId, WorkoutScheme, WorkoutSchemeExercise } from "@/types/models";
import { exercisesByServerId, loadDelta, sameJSON, type SyncContext } from "./context";
import { logSync } from "./log";
import { deleteLocally, didReject } from "./rejections";

export class WorkoutSchemeSync {
  constructor(private readonly ctx: SyncContext) {}

  private get db() {
    return this.ctx.db;
  }

  private get api() {
    return this.ctx.api;
  }

  // MARK: - Push

  async push(): Promise<void> {
    const pending = await this.db.workoutSchemes.where("syncState").notEqual("synced").toArray();
    for (const scheme of pending) {
      this.ctx.ensureRunning();
      const rows = await this.db.workoutSchemeExercises.where("schemeId").equals(scheme.id).toArray();
      const exercises = await exercisesById(this.db);
      try {
        if (scheme.serverId !== null) {
          const sent = schemeUpdateRequest(scheme, rows, exercises);
          if (!sent) continue;
          const dto = await this.api.schemes.update(scheme.serverId, sent);
          await this.ctx.transaction(async () => {
            const current = await this.db.workoutSchemes.get(scheme.id);
            if (!current) return;
            const currentRows = await this.db.workoutSchemeExercises.where("schemeId").equals(scheme.id).toArray();
            if (sameJSON(schemeUpdateRequest(current, currentRows, await exercisesById(this.db)), sent)) {
              await this.apply(dto, current, currentRows);
            }
          });
        } else {
          const sent = newSchemeRequest(scheme, rows, exercises);
          if (!sent) continue;
          const dto = await this.api.schemes.create(sent);
          await this.ctx.transaction(async () => {
            const current = await this.db.workoutSchemes.get(scheme.id);
            if (!current) {
              await addPendingDeletion(this.db, "workoutScheme", dto.id);
              return;
            }
            const currentRows = await this.db.workoutSchemeExercises.where("schemeId").equals(scheme.id).toArray();
            if (sameJSON(newSchemeRequest(current, currentRows, await exercisesById(this.db)), sent)) {
              await this.apply(dto, current, currentRows);
            } else {
              await this.db.workoutSchemes.put({ ...current, serverId: dto.id, syncState: "updated" });
            }
          });
        }
      } catch (error) {
        if (!isRejection(error)) throw error;
        const current = await this.db.workoutSchemes.get(scheme.id);
        if (!current) continue;
        await didReject(this.ctx, { type: "workoutScheme", row: current }, error);
      }
    }
  }

  /**
   * Sets the last performed date of the schemes a workout was started from. After the schemes were pushed, so that
   * the ones created offline have a server id.
   */
  async pushPerformances(): Promise<void> {
    const pending = await getPendingSchemePerformances(this.db);
    if (pending.length === 0) return;
    const schemes = await this.db.workoutSchemes.toArray();
    for (const clientUUID of pending) {
      this.ctx.ensureRunning();
      const scheme = schemes.find((entry) => entry.clientUUID.toLowerCase() === clientUUID.toLowerCase());
      if (!scheme || !(await this.db.workoutSchemes.get(scheme.id))) {
        // Deleted in the meantime
        await removePendingSchemePerformance(this.db, clientUUID);
        continue;
      }
      // A create the server rejected, sent again once the scheme is saved
      if (scheme.serverId === null) continue;
      try {
        const dto = await this.api.schemes.markPerformed(scheme.serverId);
        await this.ctx.transaction(async () => {
          const current = await this.db.workoutSchemes.get(scheme.id);
          if (current) await this.db.workoutSchemes.put({ ...current, lastPerformed: parseOptionalServerDate(dto.lastPerformed) });
        });
      } catch (error) {
        if (!isRejection(error)) throw error;
        logSync.error(`The server rejected the last performed date of the workout scheme ${scheme.serverId}: ${errorMessage(error)}`);
      }
      await removePendingSchemePerformance(this.db, clientUUID);
    }
  }

  // MARK: - Pull

  async pull(): Promise<void> {
    const syncTime = await getSyncTime(this.db, "workoutSchemes");
    if (syncTime) {
      const delta = await loadDelta<WorkoutSchemeDeltaDTO>(() => this.api.schemes.changes(syncTime));
      if (delta) {
        await this.ctx.transaction(async () => {
          const local = await this.db.workoutSchemes.toArray();
          for (const change of delta.updates) {
            const scheme = schemeOfChange(change);
            const match = findMatching(local, change.id, scheme?.clientUuid);
            if (scheme) {
              await this.upsert(scheme, match, local);
            } else if (match && match.syncState === "synced") {
              await deleteLocally(this.ctx, "workoutScheme", match.id);
              local.splice(local.indexOf(match), 1);
            }
          }
          await setSyncTime(this.db, "workoutSchemes", delta.syncTime);
        });
        return;
      }
    }

    const list = await this.api.schemes.all();
    await this.ctx.transaction(async () => {
      const local = await this.db.workoutSchemes.toArray();
      const kept = new Set<LocalId>();
      for (const dto of list.schemes) {
        kept.add((await this.upsert(dto, findMatching(local, dto.id, dto.clientUuid), local)).id);
      }
      for (const scheme of [...local]) {
        if (scheme.syncState === "synced" && !kept.has(scheme.id)) await deleteLocally(this.ctx, "workoutScheme", scheme.id);
      }
      await setSyncTime(this.db, "workoutSchemes", list.syncTime);
    });
  }

  private async upsert(dto: WorkoutSchemeDTO, match: WorkoutScheme | undefined, local: WorkoutScheme[]): Promise<WorkoutScheme> {
    if (match && match.syncState !== "synced") {
      if (match.serverId !== null) return match;
      const updated: WorkoutScheme = { ...match, serverId: dto.id, syncState: "updated" };
      await this.db.workoutSchemes.put(updated);
      local[local.indexOf(match)] = updated;
      return updated;
    }
    const rows = match ? await this.db.workoutSchemeExercises.where("schemeId").equals(match.id).toArray() : [];
    const scheme = await this.apply(dto, match ?? null, rows);
    if (match) local[local.indexOf(match)] = scheme;
    else local.push(scheme);
    return scheme;
  }

  /** `scheme.apply(dto, exercises:)` inside a transaction */
  private async apply(dto: WorkoutSchemeDTO, existing: WorkoutScheme | null, rows: WorkoutSchemeExercise[]): Promise<WorkoutScheme> {
    const applied = applySchemeDTO(dto, existing, rows, await exercisesByServerId(this.db));
    if (!applied.complete) logSync.error(`The workout scheme ${dto.id} contains an unknown exercise`);
    if (applied.deletedRowIds.length > 0) await this.db.workoutSchemeExercises.bulkDelete(applied.deletedRowIds);
    await this.db.workoutSchemes.put(applied.scheme);
    await this.db.workoutSchemeExercises.bulkPut(applied.rows);
    return applied.scheme;
  }
}
