import { formatMessageTime, isSameDay } from "./chat-feature";
import { appLocale } from "./format";

/** The time of a suggested end, with the day if it wasn't today */
export function formatWorkoutEnd(date: Date, now: Date = new Date(), locale: string = appLocale()): string {
  const time = formatMessageTime(date, locale);
  if (isSameDay(date, now)) return time;
  return `${date.toLocaleDateString(locale, { day: "numeric", month: "short" })}, ${time}`;
}
