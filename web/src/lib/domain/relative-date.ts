// `Text(date, format: .relative(presentation: .named))` of SwiftUI, e.g. "yesterday" or "2 months ago"

import { appLocale } from "./format";

type Unit = "year" | "month" | "week" | "day" | "hour" | "minute" | "second";

/** Whole calendar months from `from` to `to` (negative if `to` is earlier), like DateComponents of the calendar */
function monthsBetween(from: Date, to: Date): number {
  const sign = to >= from ? 1 : -1;
  const [start, end] = sign === 1 ? [from, to] : [to, from];
  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  const shifted = new Date(start);
  shifted.setMonth(start.getMonth() + months);
  if (shifted > end) months -= 1;
  return sign * months;
}

/** The largest unit in which the distance is at least one, and the (truncated) number of it */
function relativeParts(date: Date, now: Date): { value: number; unit: Unit } {
  const seconds = Math.trunc((date.getTime() - now.getTime()) / 1000);
  const months = monthsBetween(now, date);
  if (Math.abs(months) >= 12) return { value: Math.trunc(months / 12), unit: "year" };
  if (months !== 0) return { value: months, unit: "month" };
  const days = Math.trunc(seconds / 86_400);
  if (Math.abs(days) >= 7) return { value: Math.trunc(days / 7), unit: "week" };
  if (days !== 0) return { value: days, unit: "day" };
  const hours = Math.trunc(seconds / 3600);
  if (hours !== 0) return { value: hours, unit: "hour" };
  const minutes = Math.trunc(seconds / 60);
  if (minutes !== 0) return { value: minutes, unit: "minute" };
  return { value: seconds, unit: "second" };
}

/** e.g. "yesterday", "3 days ago" or "in 2 hours" */
export function formatRelativeNamed(date: Date, now: Date = new Date(), locale: string = appLocale()): string {
  const { value, unit } = relativeParts(date, now);
  // "now" instead of "in 0 seconds"
  const shown = unit === "second" && Math.abs(value) < 1 ? 0 : value;
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(shown === 0 ? 0 : shown, unit);
}
