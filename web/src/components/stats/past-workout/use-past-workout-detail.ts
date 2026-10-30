"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { continueWorkout, deleteWorkout, getWorkoutsInProgress } from "@/lib/repo";
import { useReferenceData, useUserSettings, useWorkout } from "@/lib/repo/hooks";

export type PastWorkoutAlert = "delete" | "continue" | "notContinue" | "notRepeat" | null;

/**
 * PastWorkoutDetailViewModel.swift: the workout with the reference data and settings to show it, and continuing,
 * repeating and deleting it
 */
export function usePastWorkoutDetail(workoutId: string) {
  const router = useRouter();
  const workout = useWorkout(workoutId);
  const reference = useReferenceData();
  const settings = useUserSettings();
  const [alert, setAlert] = useState<PastWorkoutAlert>(null);
  // Deleted, continued or repeated: nothing is shown while the next page opens
  const [leaving, setLeaving] = useState(false);

  const onContinue = async () => {
    if (!workout) return;
    if (await continueWorkout(workout.id)) {
      setLeaving(true);
      // The workout tab opens the workout in progress
      router.push("/workout");
    } else {
      setTimeout(() => setAlert("notContinue"), 500);
    }
  };

  // The free workout setup with the same name and exercises, to do this workout again
  const onRepeat = async () => {
    if (!workout) return;
    if ((await getWorkoutsInProgress()).length > 0) {
      setAlert("notRepeat");
      return;
    }
    setLeaving(true);
    router.push(`/workout/repeat/${workout.id}`);
  };

  const onDelete = async () => {
    if (!workout) return;
    setLeaving(true);
    await deleteWorkout(workout.id);
    router.replace("/stats/past-workouts");
  };

  return {
    workout,
    reference,
    settings,
    leaving,
    alert,
    showAlert: setAlert,
    closeAlert: () => setAlert(null),
    onContinue,
    onRepeat,
    onDelete,
  };
}
