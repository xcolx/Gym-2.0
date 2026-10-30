// Port of ios/Gym 2.0/Features/Workout/ActiveWorkout/StopwatchStore.swift (the pure part). Computed from timestamps,
// so it keeps the right time while the browser throttles the timers of a page in the background.

import { formatSetTime } from "./stats";
import { SET_METRIC_RANGES } from "./set-metric";

export interface Stopwatch {
  /** The seconds measured before the last start */
  accumulated: number;
  /** When it was started (ms since the epoch), null while paused */
  startedAt: number | null;
}

/** Without a stopwatch for the set it starts paused at the time the field shows */
export function stopwatchOrNew(stopwatch: Stopwatch | undefined, fieldSeconds: number): Stopwatch {
  return stopwatch ?? { accumulated: fieldSeconds, startedAt: null };
}

export function isStopwatchRunning(stopwatch: Stopwatch): boolean {
  return stopwatch.startedAt !== null;
}

/** The measured seconds at the time `now` */
export function stopwatchElapsed(stopwatch: Stopwatch, now: number): number {
  return stopwatch.accumulated + (stopwatch.startedAt === null ? 0 : Math.max(0, now - stopwatch.startedAt) / 1000);
}

export function startStopwatch(stopwatch: Stopwatch, now: number): Stopwatch {
  return stopwatch.startedAt === null ? { ...stopwatch, startedAt: now } : stopwatch;
}

export function pauseStopwatch(stopwatch: Stopwatch, now: number): Stopwatch {
  return { accumulated: stopwatchElapsed(stopwatch, now), startedAt: null };
}

/** The seconds taken over into the field when the stopwatch is stopped: rounded and within the range of the time */
export function stoppedSeconds(stopwatch: Stopwatch, now: number): number {
  const { min, max } = SET_METRIC_RANGES.time;
  return Math.min(Math.max(Math.round(stopwatchElapsed(stopwatch, now)), min), max);
}

/** e.g. "1:05.3", with the tenths of a second so the user sees it running */
export function formatStopwatch(seconds: number): string {
  const tenths = Math.trunc(seconds * 10);
  return `${formatSetTime(Math.trunc(tenths / 10))}.${tenths % 10}`;
}

/** The time since the start of a workout, e.g. "01:05:09" (WhilstWorkoutView.formatTimeInterval) */
export function formatWorkoutTimer(milliseconds: number): string {
  const total = Math.max(0, Math.trunc(milliseconds / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.trunc(total / 3600))}:${pad(Math.trunc(total / 60) % 60)}:${pad(total % 60)}`;
}
