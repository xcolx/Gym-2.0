"use client";

// The `.onAppear { openWorkoutInProgress() }` of MainView.swift: when the app starts on /home, it opens the only
// workout in progress or asks which one to continue. A page opened directly (e.g. a reloaded chat) stays open.

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { HOME_ROUTE } from "@/lib/auth/routes";
import { getWorkoutsInProgress } from "@/lib/repo";
import { InProgressWorkoutChooser } from "./InProgressWorkoutChooser";
import { activeWorkoutRoute } from "./start-workout";
import { setShownWorkout } from "./workout-navigation";

/** Mounted by the AppShell while the session is active, so it runs once per start and once after every login */
export function OpenWorkoutAtLaunch() {
  const router = useRouter();
  const pathname = usePathname();
  /** Where the app started */
  const startPath = useRef(pathname);
  const [showsChooser, setShowsChooser] = useState(false);

  useEffect(() => {
    if (startPath.current !== HOME_ROUTE) return;
    let cancelled = false;
    getWorkoutsInProgress()
      .then((workouts) => {
        if (cancelled) return;
        // The workout tab opens the only one, like selecting the tab does
        if (workouts.length === 1) router.push("/workout");
        // They are synced, so e.g. one started on another device can be in progress as well
        else if (workouts.length > 1) setShowsChooser(true);
      })
      .catch((error) => console.error("Reading the workouts in progress failed", error));
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <InProgressWorkoutChooser
      open={showsChooser}
      title="Several workouts are in progress"
      message="Which one do you want to continue now?"
      onOpen={(workout) => {
        setShownWorkout(workout.id);
        router.push(activeWorkoutRoute(workout.id));
      }}
      onClose={() => setShowsChooser(false)}
    />
  );
}
