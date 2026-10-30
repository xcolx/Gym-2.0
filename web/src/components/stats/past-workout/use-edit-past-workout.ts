"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { WorkoutExercisesEdits } from "@/components/stats/EditWorkoutExercisesSheet";
import type { SetActions } from "@/components/workout/set-actions";
import { exerciseUsesBodyweight } from "@/lib/domain/exercise";
import {
  addSetChanges,
  changingRow,
  movedRow,
  removeLastSetChanges,
  setValueChanges,
  unilateralChanges,
  withDay,
  withoutRow,
  type RowChanges,
} from "@/lib/domain/past-workout-draft";
import { durationInput } from "@/lib/domain/workout";
import { defaultWeight } from "@/lib/domain/workout-exercise";
import { goBack } from "@/lib/navigation";
import { newWorkoutExercise, saveEditedWorkout } from "@/lib/repo";
import { useReferenceData, useUserSettings } from "@/lib/repo/hooks";
import type { Exercise, LocalId, WorkoutExerciseWithExercise, WorkoutWithExercises } from "@/types/models";

/**
 * The draft of EditPastWorkoutView.swift: the name, the day, the duration and the exercises with their sets. "Save"
 * stores it and marks only what changed for the sync (`saveEditedWorkout`), closing discards it.
 */
export function useEditPastWorkout(workout: WorkoutWithExercises) {
  const router = useRouter();
  const reference = useReferenceData();
  const settings = useUserSettings();
  // Taken once, a sync doesn't change it while it is edited
  const [draft, setDraft] = useState<WorkoutWithExercises>(workout);
  // An empty field is allowed while typing, the draft's value returns once the field is left
  const [enteredTime, setEnteredTime] = useState(String(workout.duration));
  const [showEditSheet, setShowEditSheet] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const trimmedName = draft.name.trim();

  // Back to the detail: popped if it opened the editor, otherwise (a reload, a link) it replaces the editor
  const close = () => goBack(router, `/stats/past-workouts/${workout.id}`);

  const save = async () => {
    if (trimmedName === "" || isSaving) return;
    setIsSaving(true);
    try {
      await saveEditedWorkout(draft);
    } catch {
      // e.g. deleted by a sync in the meantime, there is nothing left to save
    }
    close();
  };

  // The weight of a new set: the bodyweight for bodyweight exercises (`defaultWeight`)
  const weightFor = (exercise: Exercise | null) =>
    defaultWeight(!!exercise && !!reference && exerciseUsesBodyweight(exercise, reference), settings?.bodyweight ?? 0);

  const changeExercise = (id: LocalId, change: (row: WorkoutExerciseWithExercise) => RowChanges) =>
    setDraft((current) => changingRow(current, id, change));

  // Like the repo functions of the performing workout, but on the draft
  const setActions: SetActions = {
    addSet: (id) => changeExercise(id, (row) => addSetChanges(row, weightFor(row.exercise))),
    removeLastSet: (id) => changeExercise(id, removeLastSetChanges),
    setValue: (id, metric, entryIndex, value) => changeExercise(id, (row) => setValueChanges(row, metric, entryIndex, value)),
    setUnilateral: (id, unilateral) => changeExercise(id, (row) => unilateralChanges(row, unilateral)),
  };

  const exercisesEdits: WorkoutExercisesEdits = {
    rename: (name) => setDraft((current) => ({ ...current, name })),
    add: (exercise) =>
      setDraft((current) => ({
        ...current,
        workoutExercises: [
          ...current.workoutExercises,
          { ...newWorkoutExercise(current.id, exercise, current.workoutExercises.length, weightFor(exercise)), exercise },
        ],
      })),
    remove: (index) => setDraft((current) => ({ ...current, workoutExercises: withoutRow(current.workoutExercises, index) })),
    move: (from, to) => setDraft((current) => ({ ...current, workoutExercises: movedRow(current.workoutExercises, from, to) })),
  };

  /** A day of the date input: only the day changes, a day in the future is ignored */
  const changeDay = (value: string) => {
    const date = withDay(draft.date, value);
    if (date) setDraft((current) => ({ ...current, date }));
  };

  /** The typed duration, at most MAX_WORKOUT_DURATION_MINUTES like the server */
  const changeDuration = (text: string) => {
    const input = durationInput(text);
    if (!input) return;
    setEnteredTime(input.text);
    const minutes = input.minutes;
    if (minutes !== null) setDraft((current) => ({ ...current, duration: minutes }));
  };

  return {
    draft,
    trimmedName,
    enteredTime,
    changeDay,
    changeDuration,
    resetEnteredTime: () => setEnteredTime(String(draft.duration)),
    showEditSheet,
    openEditSheet: () => setShowEditSheet(true),
    closeEditSheet: () => setShowEditSheet(false),
    isSaving,
    save,
    close,
    setActions,
    exercisesEdits,
  };
}
