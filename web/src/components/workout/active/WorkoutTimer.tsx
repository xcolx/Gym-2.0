"use client";

import { formatWorkoutTimer } from "@/lib/domain/stopwatch";
import { useNow } from "@/lib/use-now";

/** The time since the start, computed from the start date every second (also right after the page was in the background) */
export function WorkoutTimer({ start }: { start: Date }) {
  const now = useNow(1000);
  return (
    <span className="min-w-[100px] pl-2 text-headline font-semibold tabular-nums">
      {now > 0 ? formatWorkoutTimer(now - start.getTime()) : ""}
    </span>
  );
}
