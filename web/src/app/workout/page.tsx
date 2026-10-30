"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Page, PageHeader, PillLink } from "@/components/ui/Page";
import { WorkoutSchemes } from "@/components/workout/WorkoutSchemes";
import { InProgressWorkoutChooser } from "@/components/workout/InProgressWorkoutChooser";
import { activeWorkoutRoute } from "@/components/workout/start-workout";
import {
  getShownWorkout,
  setOpenedSinceTabEntered,
  setShownWorkout,
  wasOpenedSinceTabEntered,
} from "@/components/workout/workout-navigation";
import { useSchemes, useWorkoutsInProgress } from "@/lib/repo/hooks";
import type { Workout } from "@/types/models";

/**
 * Port of WorkoutView.swift and the workout part of MainView.swift: shows the workout in progress again if it was
 * open, otherwise opens the only workout in progress or asks which one to continue, and then the setup.
 */
export default function WorkoutPage() {
  const router = useRouter();
  const schemes = useSchemes();
  const inProgress = useWorkoutsInProgress();
  const [showsChooser, setShowsChooser] = useState(false);
  const evaluated = useRef(false);

  const open = (workout: Pick<Workout, "id">) => {
    setShownWorkout(workout.id);
    router.push(activeWorkoutRoute(workout.id));
  };

  useEffect(() => {
    if (!inProgress || evaluated.current) return;
    evaluated.current = true;

    // the workout the tab showed before, as long as it is in progress (the navigation path on iOS)
    const shown = getShownWorkout();
    if (shown && inProgress.some((workout) => workout.id === shown)) {
      router.replace(activeWorkoutRoute(shown));
      return;
    }
    if (shown) setShownWorkout(null);

    if (wasOpenedSinceTabEntered()) return;
    setOpenedSinceTabEntered(true);
    if (inProgress.length === 1) {
      setShownWorkout(inProgress[0].id);
      router.replace(activeWorkoutRoute(inProgress[0].id));
    } else if (inProgress.length > 1) {
      // They are synced, so e.g. one started on another device can be in progress as well
      queueMicrotask(() => setShowsChooser(true));
    }
  }, [inProgress, router]);

  // Nothing while the workout in progress is about to be opened, so the setup doesn't flash
  const shown = getShownWorkout();
  const opensWorkout =
    !inProgress ||
    (!!shown && inProgress.some((workout) => workout.id === shown)) ||
    (!wasOpenedSinceTabEntered() && inProgress.length === 1);
  if (opensWorkout) return null;

  return (
    <Page>
      <PageHeader title="Workout" />
      <div className="flex flex-1 flex-col gap-2 p-2.5 pb-6">
        <PillLink href="/workout/free">Free Workout</PillLink>
        <PillLink href="/workout/suggested/settings">Suggested Workout</PillLink>
        <div className="mt-2.5 flex flex-1 flex-col">
          <WorkoutSchemes schemes={schemes ?? []} />
        </div>
      </div>
      <InProgressWorkoutChooser
        open={showsChooser}
        title="Several workouts are in progress"
        message="Which one do you want to continue now?"
        onOpen={open}
        onClose={() => setShowsChooser(false)}
      />
    </Page>
  );
}
