// Port of ios/Gym 2.0/Core/Utilities/DateFormatting.swift and small helpers shared by the domain ports.

const pad2 = (n: number) => String(n).padStart(2, "0");

let cachedAppLocale: string | null = null;

/**
 * The locale of formatted dates and numbers, like `Locale.current` in the iOS app, which is only localized in English:
 * English with the region of the device (e.g. "en-CH" for a browser in German (Switzerland)), so the names of days and
 * months are English like the rest of the app, while the order, the clock and the first weekday follow the region.
 */
export function appLocale(languages: readonly string[] | undefined = globalThis.navigator?.languages): string {
  const useCache = languages === globalThis.navigator?.languages;
  if (useCache && cachedAppLocale) return cachedAppLocale;
  let result = "en";
  try {
    const preferred = languages?.[0];
    if (preferred) {
      const locale = new Intl.Locale(preferred);
      const region = locale.region ?? locale.maximize().region;
      result = region ? `en-${region}` : "en";
    }
  } catch {
    // an invalid language tag
  }
  if (useCache) cachedAppLocale = result;
  return result;
}

/** e.g. "15.10.26" (dd.MM.yy), in the local time zone */
export function formatDate(date: Date): string {
  return `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}.${pad2(date.getFullYear() % 100)}`;
}

/** e.g. "08:05" (HH:mm), in the local time zone */
export function timeFromDate(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** Swift's `Double.rounded()`: to the nearest integer, halfway cases away from zero (Math.round rounds -2.5 to -2). */
export function roundHalfAwayFromZero(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}

/**
 * The first day of the week as a JS weekday (0 = Sunday ... 6 = Saturday), like `Calendar.current.firstWeekday` on
 * iOS. Taken from the locale where the browser knows it, Monday otherwise.
 */
export function firstWeekday(locale: string = appLocale()): number {
  try {
    const intlLocale = new Intl.Locale(locale) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number };
      weekInfo?: { firstDay: number };
    };
    const info = intlLocale.getWeekInfo?.() ?? intlLocale.weekInfo;
    // Intl uses 1 = Monday ... 7 = Sunday
    if (info) return info.firstDay % 7;
  } catch {
    // Unknown locale or no Intl.Locale
  }
  return 1;
}

/** Midnight at the start of the week that contains `date`, in the local time zone. */
export function startOfWeek(date: Date, weekStartsOn: number = firstWeekday()): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() - weekStartsOn + 7) % 7));
  return start;
}

/** The number of characters as the server counts them (unicode scalars, an emoji can be several), for the limits */
export function characterCount(text: string): number {
  return Array.from(text).length;
}

/** Swift's `String.prefix(_:)`: the first `count` characters (grapheme clusters, an emoji with skin tone is one) */
export function prefixCharacters(text: string, count: number): string {
  const Segmenter = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  const characters = Segmenter
    ? Array.from(new Segmenter(undefined, { granularity: "grapheme" }).segment(text), (segment) => segment.segment)
    : Array.from(text);
  return characters.length <= count ? text : characters.slice(0, count).join("");
}
