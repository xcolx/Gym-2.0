import { describe, expect, it } from "vitest";

import { SET_METRICS } from "@/types/models";
import { isInRange, SET_METRIC_NAMES, SET_METRIC_RANGES, SET_METRIC_SERVER_RANGES } from "./set-metric";

describe("set metric ranges", () => {
  it("includes both limits", () => {
    expect(isInRange(0, SET_METRIC_RANGES.reps)).toBe(true);
    expect(isInRange(999, SET_METRIC_RANGES.reps)).toBe(true);
    expect(isInRange(1000, SET_METRIC_RANGES.reps)).toBe(false);
    expect(isInRange(-0.1, SET_METRIC_RANGES.weights)).toBe(false);
    expect(isInRange(-9999.99, SET_METRIC_RANGES.intensity)).toBe(true);
  });

  it("lets the server accept more reps and negative weights than the input fields", () => {
    expect(isInRange(5000, SET_METRIC_SERVER_RANGES.reps)).toBe(true);
    expect(isInRange(-20, SET_METRIC_SERVER_RANGES.weights)).toBe(true);
    expect(SET_METRIC_SERVER_RANGES.time).toEqual(SET_METRIC_RANGES.time);
    for (const metric of SET_METRICS) {
      expect(SET_METRIC_SERVER_RANGES[metric].min).toBeLessThanOrEqual(SET_METRIC_RANGES[metric].min);
      expect(SET_METRIC_SERVER_RANGES[metric].max).toBeGreaterThanOrEqual(SET_METRIC_RANGES[metric].max);
    }
  });

  it("names every metric", () => {
    expect(SET_METRICS.map((metric) => SET_METRIC_NAMES[metric])).toEqual(["Reps", "Weight", "Time", "Intensity", "Distance"]);
  });
});
