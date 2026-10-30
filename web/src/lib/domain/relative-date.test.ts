import { describe, expect, it } from "vitest";

import { formatRelativeNamed } from "./relative-date";

// Europe/Zurich (vitest.config.mts), the clocks go back on 25 October 2026
const now = new Date(2026, 9, 21, 12, 0);
const relative = (date: Date) => formatRelativeNamed(date, now, "en");

describe("formatRelativeNamed", () => {
  it("names the moments just now", () => {
    expect(relative(now)).toBe("now");
    expect(relative(new Date(2026, 9, 21, 12, 0, 0, 500))).toBe("now");
    expect(relative(new Date(2026, 9, 21, 11, 59, 30))).toBe("30 seconds ago");
  });

  it("uses the largest unit with at least one, truncated", () => {
    expect(relative(new Date(2026, 9, 21, 9, 0))).toBe("3 hours ago");
    expect(relative(new Date(2026, 9, 21, 14, 0))).toBe("in 2 hours");
    expect(relative(new Date(2026, 9, 20, 12, 0))).toBe("yesterday");
    expect(relative(new Date(2026, 9, 14, 12, 0))).toBe("last week");
    expect(relative(new Date(2026, 8, 25, 12, 0))).toBe("3 weeks ago");
    expect(relative(new Date(2026, 8, 20, 12, 0))).toBe("last month");
    expect(relative(new Date(2025, 9, 21, 12, 0))).toBe("last year");
    expect(relative(new Date(2024, 3, 1))).toBe("2 years ago");
  });

  it("counts whole calendar months", () => {
    // 2 months and 4 days
    expect(relative(new Date(2026, 11, 25))).toBe("in 2 months");
    // a day less than a month: weeks
    expect(relative(new Date(2026, 10, 20, 12, 0))).toBe("in 4 weeks");
    expect(relative(new Date(2026, 10, 21, 12, 0))).toBe("next month");
  });

  it("counts days in elapsed time across the change to winter time", () => {
    expect(relative(new Date(2026, 9, 26, 11, 0))).toBe("in 5 days");
  });

  it("uses the locale", () => {
    expect(formatRelativeNamed(new Date(2026, 9, 20, 12, 0), now, "de")).toBe("gestern");
  });
});

describe("formatRelativeNamed with the default locale", () => {
  const now = new Date(2026, 9, 15, 12, 0, 0);
  it("names the distance like SwiftUI", () => {
    expect(formatRelativeNamed(now, now)).toBe("now");
    expect(formatRelativeNamed(new Date(2026, 9, 15, 11, 55), now)).toBe("5 minutes ago");
    expect(formatRelativeNamed(new Date(2026, 9, 14, 6, 0), now)).toBe("yesterday");
    expect(formatRelativeNamed(new Date(2026, 9, 12, 12, 0), now)).toBe("3 days ago");
    expect(formatRelativeNamed(new Date(2026, 9, 1, 12, 0), now)).toBe("2 weeks ago");
    expect(formatRelativeNamed(new Date(2026, 7, 10, 12, 0), now)).toBe("2 months ago");
    expect(formatRelativeNamed(new Date(2025, 9, 1, 12, 0), now)).toBe("last year");
  });
});
