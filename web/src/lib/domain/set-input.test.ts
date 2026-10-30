import { describe, expect, it } from "vitest";

import { UnitSystem } from "@/types/models";
import {
  displaySetInput,
  formatSetInput,
  groupThousands,
  parseSetInput,
  secondsFromText,
  setInputChange,
  setInputHeader,
  setLabel,
  toggleSign,
} from "./set-input";

const metric = { weightUnit: UnitSystem.metric, distanceUnit: UnitSystem.metric };
const imperial = { weightUnit: UnitSystem.imperial, distanceUnit: UnitSystem.imperial };

describe("secondsFromText", () => {
  it("reads seconds, minutes with a point and formatted times", () => {
    expect(secondsFromText("90")).toBe(90);
    expect(secondsFromText("5.59")).toBe(359);
    expect(secondsFromText("0.1")).toBe(10);
    expect(secondsFromText("8.79")).toBe(559);
    expect(secondsFromText("1:30")).toBe(90);
    expect(secondsFromText("1:00:00")).toBe(3600);
    expect(secondsFromText("1:")).toBe(60);
    expect(secondsFromText(".5")).toBe(50);
  });

  it("refuses other texts", () => {
    expect(secondsFromText("1.234")).toBeNull();
    expect(secondsFromText("1.2.3")).toBeNull();
    expect(secondsFromText("1:2:3:4")).toBeNull();
    expect(secondsFromText("a")).toBeNull();
    expect(secondsFromText("1a")).toBeNull();
    expect(secondsFromText("-5")).toBeNull();
  });
});

describe("parseSetInput", () => {
  it("parses reps as integers only", () => {
    expect(parseSetInput("12", "reps", metric)).toBe(12);
    expect(parseSetInput("12.5", "reps", metric)).toBeNull();
    expect(parseSetInput("+5", "reps", metric)).toBe(5);
    expect(parseSetInput("", "reps", metric)).toBe(0);
  });

  it("converts weights and distances to the stored unit", () => {
    expect(parseSetInput("80,5", "weights", metric)).toBe(80.5);
    expect(parseSetInput("100", "weights", imperial)).toBeCloseTo(45.359237, 6);
    expect(parseSetInput("10'000", "distance", metric)).toBe(10000);
    expect(parseSetInput("10'000.5", "distance", metric)).toBe(10000.5);
    expect(parseSetInput("1000", "distance", imperial)).toBeCloseTo(304.8, 6);
    expect(parseSetInput("abc", "weights", metric)).toBeNull();
    expect(parseSetInput("-", "weights", metric)).toBeNull();
  });

  it("takes a lone minus of the intensity as 0", () => {
    expect(parseSetInput("-", "intensity", metric)).toBe(0);
    expect(parseSetInput("-2.5", "intensity", metric)).toBe(-2.5);
    expect(parseSetInput("1:30", "time", metric)).toBe(90);
  });
});

describe("formatSetInput", () => {
  it("formats in the unit of the user", () => {
    expect(formatSetInput(12, "reps", metric)).toBe("12");
    expect(formatSetInput(80.5, "weights", metric)).toBe("80.5");
    expect(formatSetInput(45.359237, "weights", imperial)).toBe("100");
    expect(formatSetInput(90, "time", metric)).toBe("1:30");
    expect(formatSetInput(5.25, "intensity", metric)).toBe("5.25");
    expect(formatSetInput(-2.25, "intensity", metric)).toBe("-2.25");
    expect(formatSetInput(10000.5, "distance", metric)).toBe("10'000.5");
    expect(displaySetInput(0, "reps", metric)).toBe("");
  });

  it("groups thousands", () => {
    expect(groupThousands("999")).toBe("999");
    expect(groupThousands("1000")).toBe("1'000");
    expect(groupThousands("1234567.5")).toBe("1'234'567.5");
  });
});

describe("setInputChange", () => {
  it("stores valid values, keeps the shown one and reverts invalid ones", () => {
    expect(setInputChange("80", "weights", 0, metric)).toEqual({ kind: "set", value: 80 });
    expect(setInputChange("80.", "weights", 80, metric)).toEqual({ kind: "keep" });
    expect(setInputChange("abc", "weights", 80, metric)).toEqual({ kind: "revert" });
    expect(setInputChange("1000", "reps", 10, metric)).toEqual({ kind: "revert" });
    expect(setInputChange("-5", "weights", 0, metric)).toEqual({ kind: "revert" });
    expect(setInputChange("-", "intensity", 0, metric)).toEqual({ kind: "keep" });
    expect(setInputChange("", "reps", 10, metric)).toEqual({ kind: "set", value: 0 });
    expect(setInputChange("5", "reps", null, metric)).toEqual({ kind: "keep" });
  });

  it("stores pounds as kilograms", () => {
    const change = setInputChange("100", "weights", 0, imperial);
    expect(change.kind).toBe("set");
    expect(change.kind === "set" && change.value).toBeCloseTo(45.359237, 6);
    // the value shown in pounds is not set again
    expect(setInputChange("100", "weights", 45.359237, imperial)).toEqual({ kind: "keep" });
  });
});

describe("labels", () => {
  it("names the columns and sets", () => {
    expect(setInputHeader("weights", imperial)).toBe("lbs");
    expect(setInputHeader("distance", metric)).toBe("m");
    expect(setInputHeader("intensity", metric)).toBe("Level");
    expect(setLabel(0, false)).toBe("1");
    expect(setLabel(2, true)).toBe("2  R");
    expect(setLabel(3, true)).toBe("L");
    expect(toggleSign("5")).toBe("-5");
    expect(toggleSign("-5")).toBe("5");
  });
});
