"use client";

import { formatWorkoutTimer } from "@/lib/domain/stopwatch";
import { useNow } from "@/lib/use-now";

/**
 * The time since the start below the name of the workout (WorkoutClock), computed from the start date every second (also
 * right after the page was in the background)
 */
export function WorkoutTimer({ start }: { start: Date }) {
  const now = useNow(1000);
  return (
    <span className="text-caption1 font-medium tabular-nums text-secondary-label">
      {now > 0 ? formatWorkoutTimer(now - start.getTime()) : ""}
    </span>
  );
}
