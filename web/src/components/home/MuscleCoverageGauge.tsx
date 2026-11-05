"use client";

import { useEffect, useState, type ReactNode } from "react";

// The part of the circle covered by the arc, the rest is the opening at the bottom
const ARC = 75;
// 14pt of the 340pt wide gauge on iOS
const LINE_WIDTH = 4.1;
const RADIUS = 50 - LINE_WIDTH / 2;

/**
 * Port of MuscleCoverageGaugeView.swift: how much of the body was trained recently, as a speedometer around the
 * highlighted body. The arc is open at the bottom, where the percentage is shown. It starts empty and fills up to the
 * percentage when it's shown.
 */
export function MuscleCoverageGauge({ percentage, children }: { percentage: number; children: ReactNode }) {
  const fraction = Math.min(Math.max(percentage / 100, 0), 1);
  const [shownFraction, setShownFraction] = useState(0);

  useEffect(() => {
    // after the first paint, so the arc grows from 0
    const frame = requestAnimationFrame(() => setShownFraction(fraction));
    return () => cancelAnimationFrame(frame);
  }, [fraction]);

  return (
    <div
      className="relative aspect-square w-full"
      role="meter"
      aria-label="Muscles covered"
      aria-valuenow={percentage}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={`${percentage} percent`}
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          {/* from the left to the right end of the arc, which is rotated by 135° */}
          <linearGradient
            id="muscle-coverage"
            gradientUnits="userSpaceOnUse"
            x1="0"
            y1="50"
            x2="100"
            y2="50"
            gradientTransform="rotate(-135 50 50)"
          >
            <stop offset="0" style={{ stopColor: "var(--app-color)", stopOpacity: 0.55 }} />
            <stop offset="1" style={{ stopColor: "var(--app-color)" }} />
          </linearGradient>
        </defs>
        <g transform="rotate(135 50 50)" fill="none" strokeWidth={LINE_WIDTH} strokeLinecap="round">
          <circle cx="50" cy="50" r={RADIUS} pathLength={100} strokeDasharray={`${ARC} 100`} className="stroke-field" />
          <circle
            cx="50"
            cy="50"
            r={RADIUS}
            pathLength={100}
            stroke="url(#muscle-coverage)"
            strokeDasharray={`${ARC * shownFraction} 100`}
            // a dash of length 0 would still show its round caps
            opacity={shownFraction > 0 ? 1 : 0}
            className="transition-[stroke-dasharray] duration-900 ease-out motion-reduce:transition-none"
          />
        </g>
      </svg>

      {/* the body sits a bit higher, above the percentage in the opening */}
      <div className="absolute inset-[10.6%] flex -translate-y-[3.5%] justify-center">{children}</div>

      <div className="absolute inset-x-0 -bottom-1.5 flex flex-col items-center" aria-hidden>
        <span className="font-rounded text-[34px] font-bold leading-[41px] tabular-nums">{percentage}%</span>
        <span className="text-footnote text-secondary-label">covered</span>
      </div>
    </div>
  );
}
