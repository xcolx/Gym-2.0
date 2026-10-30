"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { clearWorkoutStopwatches } from "@/components/workout/stopwatch-store";
import { celebrateWorkout, setOpenedSinceTabEntered, setShownWorkout } from "@/components/workout/workout-navigation";
import { suggestedWorkoutEnd } from "@/lib/domain/workout";
import { deleteWorkout, finishWorkout, workoutHasEnteredValues } from "@/lib/repo";
import { useWorkout } from "@/lib/repo/hooks";
import { useWakeLock } from "@/lib/use-wake-lock";
import { clearWorkoutLastChange, workoutLastChange } from "@/lib/workout-last-change";
import type { LocalId, WorkoutWithExercises } from "@/types/models";

/**
 * The workout of /workout/active/[workoutId] and leaving it: when it's ended or cancelled here, and when it's deleted
 * or ended elsewhere (e.g. on another device, the sync removes or changes the row).
 */
export function useActiveWorkout(workoutId: string) {
  const router = useRouter();
  const workout = useWorkout(workoutId);
  // set when the workout is closed here, so the change of the row doesn't close it a second time
  const leavingRef = useRef(false);

  const leave = useCallback(() => {
    leavingRef.current = true;
    setShownWorkout(null);
    // like the empty navigation path on iOS: the tab shows its root, also while other workouts are in progress
    setOpenedSinceTabEntered(true);
    clearWorkoutStopwatches(workoutId);
    clearWorkoutLastChange(workoutId);
    router.replace("/workout");
  }, [router, workoutId]);

  const inProgress = workout?.inProgress === true;
  useEffect(() => {
    if (inProgress) setShownWorkout(workoutId);
  }, [inProgress, workoutId]);

  // e.g. discarded while it was open, or finished on another device while it was open here
  const closedElsewhere = workout === null || (workout !== undefined && !workout.inProgress);
  useEffect(() => {
    if (closedElsewhere && !leavingRef.current) leave();
  }, [closedElsewhere, leave]);

  return { workout, leavingRef, leave };
}

/**
 * The state and actions of WhilstWorkoutView.swift: cancelling and ending the workout (with the suggested end or the
 * question to discard a workout without values), editing it and the exercise shown in full screen. It keeps the screen
 * on.
 */
export function useWhilstWorkout(workout: WorkoutWithExercises, leavingRef: React.RefObject<boolean>, onLeave: () => void) {
  const [asksToCancel, setAsksToCancel] = useState(false);
  const [editing, setEditing] = useState(false);
  const [suggestedEnd, setSuggestedEnd] = useState<Date | null>(null);
  const [asksToDiscardEmpty, setAsksToDiscardEmpty] = useState(false);
  const [shownExercise, setShownExercise] = useState<LocalId | null>(null);
  const closeExercise = useCallback(() => setShownExercise(null), []);
  useWakeLock(true);

  const cancel = async () => {
    leavingRef.current = true;
    await deleteWorkout(workout.id);
    onLeave();
  };

  const end = async (at?: Date) => {
    // ended first, so the workout isn't in progress anymore when it is left
    leavingRef.current = true;
    const { duration, deleted } = await finishWorkout(workout.id, at);
    onLeave();
    // e.g. the sets were emptied on another device in the meantime: nothing was saved, so there is nothing to celebrate
    if (!deleted) celebrateWorkout(duration);
  };

  const askToEnd = async () => {
    // Without any entered value finishing would delete the workout, so the user decides
    if (!(await workoutHasEnteredValues(workout.id))) {
      setAsksToDiscardEmpty(true);
      return;
    }
    const suggested = suggestedWorkoutEnd(workout, workoutLastChange(workout.id));
    if (suggested) setSuggestedEnd(suggested);
    else void end();
  };

  return {
    asksToCancel,
    askToCancel: () => setAsksToCancel(true),
    closeCancel: () => setAsksToCancel(false),
    asksToDiscardEmpty,
    closeDiscardEmpty: () => setAsksToDiscardEmpty(false),
    suggestedEnd,
    closeSuggestedEnd: () => setSuggestedEnd(null),
    editing,
    startEditing: () => setEditing(true),
    stopEditing: () => setEditing(false),
    shownExercise,
    showExercise: setShownExercise,
    closeExercise,
    cancel,
    end,
    askToEnd,
  };
}
