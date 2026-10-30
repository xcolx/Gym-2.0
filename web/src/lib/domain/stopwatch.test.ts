import { describe, expect, it } from "vitest";

import {
  formatStopwatch,
  formatWorkoutTimer,
  isStopwatchRunning,
  pauseStopwatch,
  startStopwatch,
  stoppedSeconds,
  stopwatchElapsed,
  stopwatchOrNew,
} from "./stopwatch";

describe("stopwatch", () => {
  it("starts paused at the time of the field", () => {
    const stopwatch = stopwatchOrNew(undefined, 30);
    expect(stopwatch).toEqual({ accumulated: 30, startedAt: null });
    expect(isStopwatchRunning(stopwatch)).toBe(false);
    expect(stopwatchElapsed(stopwatch, 1_000_000)).toBe(30);
    const existing = { accumulated: 5, startedAt: 10 };
    expect(stopwatchOrNew(existing, 30)).toBe(existing);
  });

  it("measures from timestamps, also across pauses", () => {
    let stopwatch = startStopwatch(stopwatchOrNew(undefined, 10), 1_000);
    expect(isStopwatchRunning(stopwatch)).toBe(true);
    expect(stopwatchElapsed(stopwatch, 3_500)).toBe(12.5);
    // starting a running stopwatch changes nothing
    expect(startStopwatch(stopwatch, 2_000)).toBe(stopwatch);

    stopwatch = pauseStopwatch(stopwatch, 4_000);
    expect(stopwatch).toEqual({ accumulated: 13, startedAt: null });
    expect(stopwatchElapsed(stopwatch, 100_000)).toBe(13);

    stopwatch = startStopwatch(stopwatch, 10_000);
    expect(stopwatchElapsed(stopwatch, 11_000)).toBe(14);
  });

  it("doesn't go back if the clock does", () => {
    const stopwatch = startStopwatch({ accumulated: 5, startedAt: null }, 10_000);
    expect(stopwatchElapsed(stopwatch, 9_000)).toBe(5);
  });

  it("takes over rounded seconds within the range of the time", () => {
    expect(stoppedSeconds({ accumulated: 12.4, startedAt: null }, 0)).toBe(12);
    expect(stoppedSeconds({ accumulated: 12.5, startedAt: null }, 0)).toBe(13);
    expect(stoppedSeconds({ accumulated: 0, startedAt: 0 }, 100_000_000)).toBe(86_400);
  });

  it("shows tenths of a second", () => {
    expect(formatStopwatch(0)).toBe("0:00.0");
    expect(formatStopwatch(65.37)).toBe("1:05.3");
    expect(formatStopwatch(3725.99)).toBe("1:02:05.9");
  });
});

describe("formatWorkoutTimer", () => {
  it("shows hours, minutes and seconds with two digits", () => {
    expect(formatWorkoutTimer(0)).toBe("00:00:00");
    expect(formatWorkoutTimer(3_909_999)).toBe("01:05:09");
    expect(formatWorkoutTimer(100 * 3_600_000)).toBe("100:00:00");
  });

  it("shows zero for a start in the future", () => {
    expect(formatWorkoutTimer(-5_000)).toBe("00:00:00");
  });
});

describe("stopwatch timestamps and formats", () => {
  it("measures from timestamps, also over a pause", () => {
    let stopwatch = stopwatchOrNew(undefined, 30);
    expect(stopwatchElapsed(stopwatch, 0)).toBe(30);
    stopwatch = startStopwatch(stopwatch, 1_000);
    expect(stopwatchElapsed(stopwatch, 11_000)).toBe(40);
    stopwatch = pauseStopwatch(stopwatch, 11_000);
    expect(stopwatch.startedAt).toBeNull();
    expect(stopwatchElapsed(stopwatch, 99_000)).toBe(40);
    stopwatch = startStopwatch(stopwatch, 100_000);
    expect(stoppedSeconds(stopwatch, 105_600)).toBe(46);
  });

  it("formats", () => {
    expect(formatStopwatch(65.37)).toBe("1:05.3");
    expect(formatWorkoutTimer(3_909_000)).toBe("01:05:09");
    expect(formatWorkoutTimer(-5)).toBe("00:00:00");
  });
});
