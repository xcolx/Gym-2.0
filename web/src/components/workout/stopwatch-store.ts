"use client";

// Port of ios/Gym 2.0/Features/Workout/ActiveWorkout/StopwatchStore.swift. Unlike on iOS the stopwatches are kept in
// the session storage, so they keep running in another tab of the app, after a reload and after Android restored a
// discarded tab.

import { createStore, useStore } from "@/lib/store";
import { pauseStopwatch, startStopwatch, stopwatchOrNew, stoppedSeconds, type Stopwatch } from "@/lib/domain/stopwatch";
import type { LocalId } from "@/types/models";

const STORAGE_KEY = "gym2.stopwatches";

/** Key: "<workoutId>/<workoutExerciseId>/<entry index>" */
type Stopwatches = Record<string, Stopwatch>;

function load(): Stopwatches {
  if (typeof window === "undefined") return {};
  try {
    const parsed: unknown = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? (parsed as Stopwatches) : {};
  } catch {
    return {};
  }
}

const store = createStore<Stopwatches>(load());

function save(next: Stopwatches) {
  store.set(next);
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // the stopwatches still work until the page is closed
  }
}

export interface StopwatchKey {
  workoutId: LocalId;
  workoutExerciseId: LocalId;
  entryIndex: number;
}

const keyOf = ({ workoutId, workoutExerciseId, entryIndex }: StopwatchKey) => `${workoutId}/${workoutExerciseId}/${entryIndex}`;

/** The stopwatch of a set, starting paused at the time the field shows if it has none */
export function useStopwatch(key: StopwatchKey, fieldSeconds: number): Stopwatch {
  return stopwatchOrNew(useStore(store)[keyOf(key)], fieldSeconds);
}

export function startSetStopwatch(key: StopwatchKey, fieldSeconds: number) {
  const all = store.get();
  save({ ...all, [keyOf(key)]: startStopwatch(stopwatchOrNew(all[keyOf(key)], fieldSeconds), Date.now()) });
}

export function pauseSetStopwatch(key: StopwatchKey, fieldSeconds: number) {
  const all = store.get();
  save({ ...all, [keyOf(key)]: pauseStopwatch(stopwatchOrNew(all[keyOf(key)], fieldSeconds), Date.now()) });
}

/** Removes the stopwatch and returns the measured seconds (rounded, within the range of the time) */
export function stopSetStopwatch(key: StopwatchKey, fieldSeconds: number): number {
  const all = { ...store.get() };
  const seconds = stoppedSeconds(stopwatchOrNew(all[keyOf(key)], fieldSeconds), Date.now());
  delete all[keyOf(key)];
  save(all);
  return seconds;
}

/** Removes the stopwatches of a workout, when it is ended or cancelled */
export function clearWorkoutStopwatches(workoutId: LocalId) {
  const all = store.get();
  const kept = Object.fromEntries(Object.entries(all).filter(([key]) => !key.startsWith(`${workoutId}/`)));
  if (Object.keys(kept).length !== Object.keys(all).length) save(kept);
}
