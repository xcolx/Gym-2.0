import { formatDayMonth } from "@/lib/domain/stats-overview";
import { formatNumber } from "@/lib/domain/units";

const HEIGHT = 180;

/**
 * The line chart of the progress of an exercise (the Chart of ExercisesStatsDetailView.swift): a point per time it
 * was done, in the app color, with a scale that doesn't start at 0. The line is an SVG stretched over the area, the
 * points and labels are HTML, so they keep their shape at any width.
 */
export function ProgressChart({ points, label }: { points: readonly { date: Date; value: number }[]; label: string }) {
  if (points.length === 0) {
    return (
      <p className="flex items-center justify-center text-subheadline text-secondary-label" style={{ height: HEIGHT }}>
        No values in this period.
      </p>
    );
  }

  const values = points.map((point) => point.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  // some room above and below the points, also for a single value
  const padding = max > min ? (max - min) * 0.15 : Math.max(Math.abs(max) * 0.1, 1);
  min = Math.max(0, min - padding);
  max += padding;
  const ticks = [max, (min + max) / 2, min];

  const first = points[0].date.getTime();
  const last = points[points.length - 1].date.getTime();
  // In percent of the area. A single point or a single day sits in the middle.
  const x = (date: Date) => (last > first ? ((date.getTime() - first) / (last - first)) * 100 : 50);
  const y = (value: number) => (1 - (value - min) / (max - min)) * 100;
  const dotSize = points.length > 30 ? 5 : 8;

  return (
    <figure aria-label={label} className="flex flex-col gap-1">
      <div className="flex gap-2" style={{ height: HEIGHT }}>
        <div className="relative min-w-0 flex-1">
          {ticks.map((tick) => (
            <span key={tick} className="absolute inset-x-0 border-t border-dashed border-separator" style={{ top: `${y(tick)}%` }} />
          ))}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden>
            <polyline
              points={points.map((point) => `${x(point.date)},${y(point.value)}`).join(" ")}
              fill="none"
              stroke="var(--app-color)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {points.map((point, index) => (
            <span
              key={index}
              title={`${formatDayMonth(point.date)}: ${formatNumber(point.value, 1)}`}
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-app"
              style={{ left: `${x(point.date)}%`, top: `${y(point.value)}%`, width: dotSize, height: dotSize }}
            />
          ))}
        </div>
        {/* the scale on the right, like Swift Charts */}
        <div className="relative w-9 shrink-0 text-[11px] text-secondary-label tabular-nums" aria-hidden>
          {ticks.map((tick) => (
            <span key={tick} className="absolute right-0 -translate-y-1/2" style={{ top: `${y(tick)}%` }}>
              {formatNumber(tick, tick < 10 ? 1 : 0)}
            </span>
          ))}
        </div>
      </div>
      <div className="mr-11 flex justify-between text-[11px] text-secondary-label" aria-hidden>
        <span>{formatDayMonth(points[0].date)}</span>
        {last > first && <span>{formatDayMonth(points[points.length - 1].date)}</span>}
      </div>
    </figure>
  );
}
