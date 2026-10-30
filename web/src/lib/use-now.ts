"use client";

import { useSyncExternalStore } from "react";

interface Clock {
  subscribe: (listener: () => void) => () => void;
  get: () => number;
}

const clocks = new Map<number, Clock>();

/** One clock per interval, shared by all components that use it */
function createClock(interval: number): Clock {
  let now = Date.now();
  let timer: ReturnType<typeof setInterval> | null = null;
  const listeners = new Set<() => void>();
  const tick = () => {
    now = Date.now();
    listeners.forEach((listener) => listener());
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") tick();
  };
  return {
    subscribe(listener) {
      listeners.add(listener);
      if (!timer) {
        tick();
        timer = setInterval(tick, interval);
        document.addEventListener("visibilitychange", onVisible);
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && timer) {
          clearInterval(timer);
          timer = null;
          document.removeEventListener("visibilitychange", onVisible);
        }
      };
    },
    get: () => now,
  };
}

function clockFor(interval: number): Clock {
  let clock = clocks.get(interval);
  if (!clock) {
    clock = createClock(interval);
    clocks.set(interval, clock);
  }
  return clock;
}

const serverNow = () => 0;

/**
 * The current time (ms since the epoch), updated every `interval` ms while a component uses it, and right away when
 * the page becomes visible again. Durations shown with it are computed from timestamps, so they are right also after
 * the browser throttled the timers of the page in the background. 0 during the server render.
 */
export function useNow(interval = 1000): number {
  const clock = clockFor(interval);
  return useSyncExternalStore(clock.subscribe, clock.get, serverNow);
}
