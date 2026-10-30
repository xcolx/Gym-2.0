import { describe, expect, it } from "vitest";

import { formatWorkoutEnd } from "./workout-end";

describe("formatWorkoutEnd", () => {
  const now = new Date(2026, 9, 12, 21, 0);

  it("shows only the time for today", () => {
    expect(formatWorkoutEnd(new Date(2026, 9, 12, 19, 5), now, "de-CH")).toBe("19:05");
  });

  it("adds the day for an earlier day", () => {
    const text = formatWorkoutEnd(new Date(2026, 9, 11, 19, 5), now, "en-GB");
    expect(text).toBe("11 Oct, 19:05");
  });
});
