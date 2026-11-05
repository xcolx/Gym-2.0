"use client";

import { useEffect, useRef } from "react";

import { appLocale, firstWeekday } from "@/lib/domain/format";
import { formatDuration } from "@/lib/domain/stats";
import {
  activityLevel,
  activityWeeks,
  dayKey,
  formatDayMonth,
  minutesSince,
  monthStartIndices,
} from "@/lib/domain/stats-overview";

const LEVEL_COLORS = ["bg-field", "bg-app/30", "bg-app/55", "bg-app/80", "bg-app"] as const;
const CELL = "size-[13px] rounded-[3px]";

/**
 * Port of ActivityBoardView.swift: the minutes worked out per day of the last year as a board of squares, a column per
 * week, darker the longer the workouts of the day were. Tapping a day shows its minutes, until it's tapped again or the
 * overview clears it. The board starts scrolled to the current week.
 */
export function ActivityBoard({
  minutesByDay,
  now,
  selectedDay,
  onSelectDay,
}: {
  /** By `dayKey` */
  minutesByDay: ReadonlyMap<number, number>;
  now: Date;
  /** The `dayKey` of the selected day */
  selectedDay: number | null;
  onSelectDay: (day: number | null) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const locale = appLocale();
  const weeks = activityWeeks(now, firstWeekday(locale));
  const monthStarts = monthStartIndices(weeks);
  const today = dayKey(now);
  const minutesThisYear = minutesSince(minutesByDay, weeks[0][0]);

  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
  }, []);

  const selectedMinutes = selectedDay === null ? 0 : (minutesByDay.get(selectedDay) ?? 0);
  const caption =
    selectedDay === null
      ? `${formatDuration(minutesThisYear)} in the last year`
      : `${formatDayMonth(new Date(selectedDay), locale)}: ${selectedMinutes === 0 ? "no workout" : formatDuration(selectedMinutes)}`;

  return (
    <section className="card flex flex-col gap-3 p-4" aria-label="Activity">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-headline font-semibold">Activity</h2>
        <p className="text-footnote text-secondary-label tabular-nums" aria-live="polite">
          {caption}
        </p>
      </div>

      <div className="flex gap-1.5" aria-hidden>
        {/* The first, third and fifth weekday, like on GitHub, below the month labels */}
        <div className="flex shrink-0 flex-col gap-[3px] pt-[18px]">
          {weeks[0].map((day, row) => (
            <span key={row} className="h-[13px] text-[10px] leading-[13px] text-secondary-label">
              {row % 2 === 0 && row < 6 ? day.toLocaleDateString(locale, { weekday: "short" }) : ""}
            </span>
          ))}
        </div>

        <div ref={scroller} className="min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max flex-col gap-1">
            <div className="flex gap-[3px]">
              {weeks.map((week, index) => (
                <span key={index} className="h-[14px] w-[13px] overflow-visible whitespace-nowrap text-[10px] leading-[14px] text-secondary-label">
                  {monthStarts.has(index) ? week[0].toLocaleDateString(locale, { month: "short" }) : ""}
                </span>
              ))}
            </div>
            <div className="flex gap-[3px]">
              {weeks.map((week, index) => (
                <div key={index} className="flex flex-col gap-[3px]">
                  {week.map((date) => {
                    const day = dayKey(date);
                    // the rest of the current week
                    if (day > today) return <span key={day} className={CELL} />;
                    const isSelected = day === selectedDay;
                    return (
                      <button
                        key={day}
                        type="button"
                        tabIndex={-1}
                        onClick={(event) => {
                          // a tap anywhere else clears the day
                          event.stopPropagation();
                          onSelectDay(isSelected ? null : day);
                        }}
                        className={`${CELL} ${LEVEL_COLORS[activityLevel(minutesByDay.get(day) ?? 0)]} ${
                          isSelected ? "ring-[1.5px] ring-foreground ring-inset" : ""
                        }`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-[3px] text-[10px] text-secondary-label" aria-hidden>
        <span className="pr-0.5">Less</span>
        {LEVEL_COLORS.map((color) => (
          <span key={color} className={`${CELL} ${color}`} />
        ))}
        <span className="pl-0.5">More</span>
      </div>
    </section>
  );
}
