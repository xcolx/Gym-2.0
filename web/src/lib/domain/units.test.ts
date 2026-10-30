import { describe, expect, it } from "vitest";

import { UnitSystem } from "@/types/models";
import {
  distanceFromMeters,
  formatDistance,
  formatNumber,
  formatVolume,
  formatWeight,
  kilogramsFromWeight,
  metersFromDistance,
  unitOrMetric,
  weightFromKilograms,
} from "./units";

const { metric, imperial } = UnitSystem;

describe("units", () => {
  it("converts weights and distances both ways", () => {
    expect(weightFromKilograms(100, metric)).toBe(100);
    expect(weightFromKilograms(0.45359237, imperial)).toBeCloseTo(1);
    expect(kilogramsFromWeight(weightFromKilograms(80, imperial), imperial)).toBeCloseTo(80);
    expect(distanceFromMeters(0.3048, imperial)).toBeCloseTo(1);
    expect(metersFromDistance(distanceFromMeters(500, imperial), imperial)).toBeCloseTo(500);
  });

  it("treats a missing unit as metric", () => {
    expect(unitOrMetric(null)).toBe(metric);
    expect(unitOrMetric(imperial)).toBe(imperial);
  });

  it("formats weights with one decimal", () => {
    expect(formatWeight(50, metric)).toBe("50.0 kg");
    expect(formatWeight(100, imperial)).toBe("220.5 lbs");
  });

  it("formats distances, from 1 km or 1 mile upwards in km or mi", () => {
    expect(formatDistance(400, metric)).toBe("400 m");
    expect(formatDistance(1500, metric)).toBe("1.5 km");
    expect(formatDistance(100, imperial)).toBe("328.1 ft");
    expect(formatDistance(1609.344, imperial)).toBe("1 mi");
  });

  it("shortens volumes with k and M", () => {
    expect(formatVolume(999, metric)).toBe("999 kg");
    expect(formatVolume(12_500, metric)).toBe("12.5k kg");
    expect(formatVolume(2_500_000, metric)).toBe("2.50M kg");
  });

  it("formats numbers without trailing zeros", () => {
    expect(formatNumber(80, 1)).toBe("80");
    expect(formatNumber(80.5, 1)).toBe("80.5");
    expect(formatNumber(1.5, 2)).toBe("1.5");
    expect(formatNumber(-0.04, 1)).toBe("0");
  });
});

describe("rounding like String(format:) of Foundation", () => {
  it("rounds exact ties to the even digit like printf", () => {
    expect(formatNumber(6.25, 1)).toBe("6.2");
    expect(formatNumber(6.75, 1)).toBe("6.8");
    expect(formatWeight(22.25, UnitSystem.metric)).toBe("22.2 kg");
    expect(formatVolume(12_250, UnitSystem.metric)).toBe("12.2k kg");
    expect(formatVolume(2.5, UnitSystem.metric)).toBe("2 kg");
  });
});
