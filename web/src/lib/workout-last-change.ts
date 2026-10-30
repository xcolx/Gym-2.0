// Port of ios/Gym 2.0/Core/Storage/WorkoutLastChange.swift

import type { LocalId } from "@/types/models";

const STORAGE_KEY = "gym2.workoutLastChange";

/** Key: the local id of the workout, value: milliseconds since 1970 */
type LastChanges = Record<LocalId, number>;

function load(): LastChanges {
  if (typeof window === "undefined") return {};
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? (parsed as LastChanges) : {};
  } catch {
    return {};
  }
}

function save(lastChanges: LastChanges) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lastChanges));
  } catch {
    // without storage the workout ends now, like on another device
  }
}

/** Records a change by the user of the workout in progress, now */
export function recordWorkoutChange(workoutId: LocalId, date: Date = new Date()) {
  save({ ...load(), [workoutId]: date.getTime() });
}

export function workoutLastChange(workoutId: LocalId): Date | null {
  const time = load()[workoutId];
  return typeof time === "number" ? new Date(time) : null;
}

/** Forgets the last change, when the workout is ended, cancelled or continued */
export function clearWorkoutLastChange(workoutId: LocalId) {
  const lastChanges = load();
  if (!(workoutId in lastChanges)) return;
  delete lastChanges[workoutId];
  save(lastChanges);
}
