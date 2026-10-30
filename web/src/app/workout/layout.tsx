"use client";

import { useEffect, type ReactNode } from "react";

import { WorkoutCelebrationOverlay } from "@/components/workout/WorkoutCelebration";
import { setOpenedSinceTabEntered } from "@/components/workout/workout-navigation";

/**
 * The workout tab. Leaving it (to another tab) means that entering it again opens the workout in progress, like
 * MainView does when the tab is selected. The celebration of an ended workout is shown above the tab bar.
 */
export default function WorkoutLayout({ children }: { children: ReactNode }) {
  useEffect(() => () => setOpenedSinceTabEntered(false), []);
  return (
    <>
      {children}
      <WorkoutCelebrationOverlay />
    </>
  );
}
