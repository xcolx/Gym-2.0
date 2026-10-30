"use client";

import { useEffect } from "react";

/**
 * Keeps the screen on while `active` (Screen Wake Lock API), e.g. during a workout. The browser releases the lock when
 * the page is hidden, so it is requested again whenever the page becomes visible. Does nothing where the API is missing
 * or refused (e.g. low battery).
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;

    const request = async () => {
      if (document.visibilityState !== "visible" || (lock && !lock.released)) return;
      try {
        const sentinel = await navigator.wakeLock.request("screen");
        if (cancelled) await sentinel.release();
        else lock = sentinel;
      } catch {
        // refused, e.g. by the battery saver: the screen may turn off
      }
    };

    void request();
    document.addEventListener("visibilitychange", request);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", request);
      void lock?.release().catch(() => {});
    };
  }, [active]);
}
