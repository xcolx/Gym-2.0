import { describe, expect, it } from "vitest";

import { formatDaySeparator } from "./chat-feature";
import { appLocale, firstWeekday } from "./format";

describe("appLocale", () => {
  it("is English with the region of the browser, like Locale.current of the English-only iOS app", () => {
    expect(appLocale(["de-CH", "de"])).toBe("en-CH");
    expect(appLocale(["de"])).toBe("en-DE");
    expect(appLocale(["en-US"])).toBe("en-US");
    expect(appLocale([])).toBe("en");
  });

  it("names days and months in English and keeps the first weekday of the region", () => {
    expect(formatDaySeparator(new Date(2026, 9, 15), appLocale(["de-DE"]))).toBe("Thursday, 15 October");
    expect(firstWeekday(appLocale(["de-DE"]))).toBe(1);
    expect(firstWeekday(appLocale(["en-US"]))).toBe(0);
  });
});
