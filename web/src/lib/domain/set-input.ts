// Port of the text handling of ios/Gym 2.0/Features/Workout/Sets/NumberInsertView.swift

import type { SetMetric, UnitSystem } from "@/types/models";
import { SET_METRIC_RANGES, isInRange } from "./set-metric";
import { formatSetTime } from "./stats";
import { distanceFromMeters, distanceSymbol, formatNumber, kilogramsFromWeight, metersFromDistance, weightFromKilograms, weightSymbol } from "./units";

export interface SetInputUnits {
  weightUnit: UnitSystem;
  distanceUnit: UnitSystem;
}

/** The column header of a metric, e.g. "Reps" or "kg" */
export function setInputHeader(metric: SetMetric, units: SetInputUnits): string {
  switch (metric) {
    case "reps":
      return "Reps";
    case "weights":
      return weightSymbol(units.weightUnit);
    case "time":
      return "Time";
    case "intensity":
      return "Level";
    case "distance":
      return distanceSymbol(units.distanceUnit);
  }
}

export function setInputPlaceholder(metric: SetMetric): string {
  return metric === "time" ? "m.ss" : "";
}

/** The keyboard of the field: digits only for reps, digits with a decimal separator otherwise */
export function setInputMode(metric: SetMetric): "numeric" | "decimal" {
  return metric === "reps" ? "numeric" : "decimal";
}

const INTEGER = /^[+-]?\d+$/;
const DECIMAL = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

function parseDecimal(text: string): number | null {
  return DECIMAL.test(text) ? Number(text) : null;
}

/**
 * Seconds of a typed time. Without a point the number are seconds, "90" is 1:30. With a point it are minutes and
 * seconds, "5.59" is 5:59, "0.1" is 0:10 and seconds from 60 carry over, "8.79" is 9:19. A formatted time like "1:30"
 * or "1:00:00" is read too. Null if the text is no time.
 */
export function secondsFromText(text: string): number | null {
  const separator = text.includes(":") ? ":" : ".";
  const parts = text.split(separator);
  if (!parts.every((part) => /^[0-9]*$/.test(part))) return null;
  const int = (part: string) => (part === "" ? 0 : Number(part));

  if (separator === ":") {
    if (parts.length > 3) return null;
    return parts.reduce((total, part) => total * 60 + int(part), 0);
  }
  if (parts.length > 2) return null;
  const first = int(parts[0]);
  if (parts.length < 2) return first;
  // the digits after the point are the seconds like decimals, so one digit are tens of seconds
  const secondsText = parts[1];
  if (secondsText.length > 2) return null;
  const seconds = int(secondsText) * (secondsText.length === 1 ? 10 : 1);
  return first * 60 + seconds;
}

/**
 * The value of a typed text in the stored unit, null if the text is invalid. An empty field (and "-" for the
 * intensity, which can be negative) is 0. A comma (e.g. of a German keyboard) is read as point, "'" are ignored.
 */
export function parseSetInput(text: string, metric: SetMetric, units: SetInputUnits): number | null {
  const cleaned = text.trim().replaceAll(",", ".").replaceAll("'", "");
  if (cleaned === "" || (metric === "intensity" && cleaned === "-")) return 0;
  switch (metric) {
    case "reps":
      return INTEGER.test(cleaned) ? Number(cleaned) : null;
    case "weights": {
      const weight = parseDecimal(cleaned);
      return weight === null ? null : kilogramsFromWeight(weight, units.weightUnit);
    }
    case "time":
      return secondsFromText(cleaned);
    case "intensity":
      return parseDecimal(cleaned);
    case "distance": {
      const distance = parseDecimal(cleaned);
      return distance === null ? null : metersFromDistance(distance, units.distanceUnit);
    }
  }
}

/** e.g. "10000.5" as "10'000.5", numbers below 1000 stay the same */
export function groupThousands(number: string): string {
  const [integer, ...decimals] = number.split(".");
  const negative = integer.startsWith("-");
  let digits = negative ? integer.slice(1) : integer;
  const groups: string[] = [];
  while (digits.length > 3) {
    groups.unshift(digits.slice(-3));
    digits = digits.slice(0, -3);
  }
  groups.unshift(digits);
  const grouped = (negative ? "-" : "") + groups.join("'");
  return decimals.length > 0 ? `${grouped}.${decimals.join(".")}` : grouped;
}

/** The text of a stored value in the unit the user picked, e.g. "80.5" or "1:30" */
export function formatSetInput(value: number, metric: SetMetric, units: SetInputUnits): string {
  switch (metric) {
    case "reps":
      return String(Math.trunc(value));
    case "weights":
      return formatNumber(weightFromKilograms(value, units.weightUnit), 1);
    case "time":
      return formatSetTime(Math.trunc(value));
    case "intensity":
      return formatNumber(value, 2);
    case "distance":
      return groupThousands(formatNumber(distanceFromMeters(value, units.distanceUnit), 1));
  }
}

/** What a field shows when it isn't edited: the formatted value, nothing for 0 */
export function displaySetInput(value: number | null, metric: SetMetric, units: SetInputUnits): string {
  return value ? formatSetInput(value, metric, units) : "";
}

type SetInputChange =
  /** Store the value (stored unit), the field keeps the typed text */
  | { kind: "set"; value: number }
  /** Nothing to store, e.g. "80." while 80 is stored, or a partial input like "-" */
  | { kind: "keep" }
  /** Invalid or out of range: the field shows the stored value again */
  | { kind: "revert" };

/**
 * What a typed text does (NumberInsertView.textChanged): a valid value in range is stored unless it is the value
 * already shown, anything else shows the stored value again. `stored` is null if the metric isn't tracked.
 */
export function setInputChange(text: string, metric: SetMetric, stored: number | null, units: SetInputUnits): SetInputChange {
  if (stored === null) return { kind: "keep" };
  const value = parseSetInput(text, metric, units);
  if (value === null || !Number.isFinite(value) || !isInRange(value, SET_METRIC_RANGES[metric])) return { kind: "revert" };
  // Not set again for the value that is shown, e.g. right after it was formatted
  if (parseSetInput(formatSetInput(stored, metric, units), metric, units) === value) return { kind: "keep" };
  return { kind: "set", value };
}

/** "-" added to or removed from the start of the text (the "±" key of the intensity) */
export function toggleSign(text: string): string {
  return text.startsWith("-") ? text.slice(1) : `-${text}`;
}

/** The set label of an entry: "1", "2", ... or for unilateral exercises "1  R" and "L" */
export function setLabel(entryIndex: number, unilateral: boolean): string {
  if (!unilateral) return String(entryIndex + 1);
  return entryIndex % 2 === 0 ? `${entryIndex / 2 + 1}  R` : "L";
}
