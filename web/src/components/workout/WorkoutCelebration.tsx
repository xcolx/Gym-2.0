"use client";

// Port of ios/Gym 2.0/Features/Workout/ActiveWorkout/WorkoutCelebrationView.swift. A short vibration replaces the
// haptics where the browser supports it.

import { useEffect, useRef } from "react";

import { CELEBRATION_DURATION, CELEBRATION_TIMING, celebrationEmojiCount, celebrationParticles } from "@/lib/domain/celebration";
import { Portal } from "@/components/ui/overlay";
import { endCelebration, useCelebration } from "./workout-navigation";

/** The middle of the visible link to the stats tab (the tab bar on phones, the sidebar on larger screens) */
function statsTabCenter(): { x: number; y: number } {
  for (const link of document.querySelectorAll<HTMLElement>('a[href="/stats"]')) {
    const rect = link.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }
  return { x: window.innerWidth * 0.7, y: window.innerHeight - 50 };
}

/** One firm tap whenever an emoji disappears, at most one every 40 ms, more would blur into a buzz */
function vibrate(milliseconds: number) {
  try {
    navigator.vibrate?.(milliseconds);
  } catch {
    // not allowed without a user gesture in some browsers
  }
}

/** Shown above everything while a celebration runs, mounted by the workout layout */
export function WorkoutCelebrationOverlay() {
  const celebration = useCelebration();
  if (!celebration) return null;
  return (
    <Portal>
      <CelebrationEmojis key={celebration.id} id={celebration.id} durationMinutes={celebration.durationMinutes} />
    </Portal>
  );
}

function CelebrationEmojis({ id, durationMinutes }: { id: number; durationMinutes: number }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = container.current;
    if (!root) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const center = { x: width / 2, y: height / 2 };
    const target = statsTabCenter();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const particles = celebrationParticles(celebrationEmojiCount(durationMinutes), width, height);
    const { explosion, hold, flight } = CELEBRATION_TIMING;
    let lastTap = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const animations: Animation[] = [];

    vibrate(40);
    for (const particle of particles) {
      const emoji = document.createElement("span");
      emoji.textContent = "💪";
      emoji.style.cssText = `position:absolute;left:0;top:0;font-size:${particle.size}px;line-height:1;will-change:transform,opacity;`;
      root.appendChild(emoji);
      const at = (x: number, y: number, rotation: number, scale: number) =>
        `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${rotation}deg) scale(${scale})`;
      const exploded = { x: center.x + particle.dx, y: center.y + particle.dy };
      const flightStart = explosion + hold + particle.stagger;
      const total = flightStart + flight;
      const keyframes: Keyframe[] = [
        { offset: 0, transform: at(center.x, center.y, 0, 0.2), opacity: 1, easing: "cubic-bezier(0.34, 1.45, 0.64, 1)" },
        { offset: explosion / total, transform: at(exploded.x, exploded.y, particle.rotation, 1), opacity: 1 },
        { offset: flightStart / total, transform: at(exploded.x, exploded.y, particle.rotation, 1), opacity: 1, easing: "ease-in" },
        { offset: 1, transform: at(target.x, target.y, particle.rotation, 0.2), opacity: 0 },
      ];
      animations.push(emoji.animate(keyframes, { duration: (reducedMotion ? total / 2 : total) * 1000, fill: "forwards" }));
      timers.push(
        setTimeout(() => {
          const now = performance.now();
          if (now - lastTap < 40) return;
          lastTap = now;
          vibrate(10);
        }, total * 1000),
      );
    }
    timers.push(setTimeout(() => endCelebration(id), (CELEBRATION_DURATION + 0.1) * 1000));
    return () => {
      timers.forEach(clearTimeout);
      animations.forEach((animation) => animation.cancel());
      root.replaceChildren();
    };
  }, [id, durationMinutes]);

  return <div ref={container} className="pointer-events-none fixed inset-0 z-[200] overflow-hidden" aria-hidden="true" />;
}
