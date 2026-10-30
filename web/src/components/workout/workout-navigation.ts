"use client";

// The navigation state of the workout tab that MainView.swift keeps: which workout in progress the tab shows, whether
// it was already opened since the tab was entered, and the celebration of an ended workout.

import { createStore, useStore } from "@/lib/store";
import type { LocalId } from "@/types/models";

const STORAGE_KEY = "gym2.shownWorkout";

function loadShown(): LocalId | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

let shownWorkoutId: LocalId | null = loadShown();

/** The workout the tab shows, null after it was closed (ended, cancelled, or closed on another device) */
export function getShownWorkout(): LocalId | null {
  return shownWorkoutId;
}

export function setShownWorkout(id: LocalId | null) {
  shownWorkoutId = id;
  try {
    if (id) window.sessionStorage.setItem(STORAGE_KEY, id);
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // only restored within this page load then
  }
}

/**
 * Whether the workout in progress was opened (or the chooser shown) since the workout tab was entered. MainView opens
 * it when the tab is selected, but not again while the user stays in the tab, e.g. after cancelling the chooser or
 * after ending one of several workouts in progress.
 */
let openedSinceTabEntered = false;

export function wasOpenedSinceTabEntered(): boolean {
  return openedSinceTabEntered;
}

export function setOpenedSinceTabEntered(opened: boolean) {
  openedSinceTabEntered = opened;
}

// MARK: - Celebration

interface Celebration {
  /** A new id restarts the animation, e.g. if two workouts end right after each other */
  id: number;
  durationMinutes: number;
}

const celebrationStore = createStore<Celebration | null>(null);
let celebrationCounter = 0;

/** Shows the celebration of an ended workout (the `celebrateWorkout` environment action) */
export function celebrateWorkout(durationMinutes: number) {
  celebrationStore.set({ id: ++celebrationCounter, durationMinutes });
}

export function useCelebration(): Celebration | null {
  return useStore(celebrationStore);
}

export function endCelebration(id: number) {
  celebrationStore.set((current) => (current?.id === id ? null : current));
}
