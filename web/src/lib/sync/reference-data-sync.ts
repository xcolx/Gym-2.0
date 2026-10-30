// The reference data only changes on the server and has no delta, so every pull loads all of it

import { equipmentFromDTO, muscleFromDTO, muscleGroupFromDTO } from "@/lib/api";
import type { Table } from "dexie";
import { sameJSON, type SyncContext } from "./context";

export async function pullReferenceData(ctx: SyncContext): Promise<void> {
  const { api, db } = ctx;
  const muscles = await api.exercises.muscles();
  const muscleGroups = await api.exercises.muscleGroups();
  const equipment = await api.exercises.equipment();
  await ctx.transaction(async () => {
    await replaceRows(db.muscles, muscles.map(muscleFromDTO));
    await replaceRows(db.muscleGroups, muscleGroups.map(muscleGroupFromDTO));
    await replaceRows(db.equipment, equipment.map(equipmentFromDTO));
  });
}

/** Makes the local reference data match the server's, writing only what changed (inside a transaction) */
async function replaceRows<Row extends { serverId: number }>(table: Table<Row, number>, rows: Row[]): Promise<void> {
  const local = await table.toArray();
  const byId = new Map(local.map((row) => [row.serverId, row]));
  const keep = new Set(rows.map((row) => row.serverId));
  const removed = local.filter((row) => !keep.has(row.serverId)).map((row) => row.serverId);
  const changed = rows.filter((row) => !sameJSON(byId.get(row.serverId), row));
  if (removed.length > 0) await table.bulkDelete(removed);
  if (changed.length > 0) await table.bulkPut(changed);
}
