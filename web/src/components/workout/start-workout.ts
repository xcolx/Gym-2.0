"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { getWorkoutsInProgress } from "@/lib/repo";
import type { LocalId, Workout } from "@/types/models";
import { setShownWorkout } from "./workout-navigation";

/** The route of the performing workout. Other features navigate to `/workout`, which opens the workout in progress. */
export const activeWorkoutRoute = (id: LocalId) => `/workout/active/${id}`;

/**
 * A new workout can only be started if none is in progress: `start` shows the chooser of the workouts in progress
 * instead ("A workout is already in progress"), otherwise it starts the workout and opens it.
 */
export function useStartWorkout() {
  const router = useRouter();
  const [showsWorkoutInProgress, setShowsWorkoutInProgress] = useState(false);

  const open = useCallback(
    (workout: Pick<Workout, "id">) => {
      setShownWorkout(workout.id);
      // replaced, the back button doesn't lead to the setup again
      router.replace(activeWorkoutRoute(workout.id));
    },
    [router],
  );

  /** `create` starts the workout (after the check), it may also ask the user first and resolve to null */
  const start = useCallback(
    async (create: () => Promise<Workout | null>) => {
      if ((await getWorkoutsInProgress()).length > 0) {
        setShowsWorkoutInProgress(true);
        return;
      }
      const workout = await create();
      if (workout) open(workout);
    },
    [open],
  );

  const chooser = {
    open: showsWorkoutInProgress,
    title: "A workout is already in progress",
    message: "Finish or cancel it before you start a new one.",
    onOpen: open,
    onClose: () => setShowsWorkoutInProgress(false),
  };

  return { start, open, chooser };
}
