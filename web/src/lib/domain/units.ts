// Port of ios/Gym 2.0/Core/Domain/Units.swift

import { UnitSystem } from "@/types/models";
import { printfFixed } from "./printf";

const KILOGRAMS_PER_POUND = 0.45359237;
const METERS_PER_FOOT = 0.3048;
const FEET_PER_MILE = 5280;

/** The unit of a user setting, metric if it was never set (like UserSettings.swift). */
export function unitOrMetric(unit: UnitSystem | null | undefined): UnitSystem {
  return unit === UnitSystem.imperial ? UnitSystem.imperial : UnitSystem.metric;
}

export function weightSymbol(unit: UnitSystem): string {
  return unit === UnitSystem.metric ? "kg" : "lbs";
}

export function distanceSymbol(unit: UnitSystem): string {
  return unit === UnitSystem.metric ? "m" : "ft";
}

export function weightFromKilograms(kilograms: number, unit: UnitSystem): number {
  return unit === UnitSystem.metric ? kilograms : kilograms / KILOGRAMS_PER_POUND;
}

export function kilogramsFromWeight(weight: number, unit: UnitSystem): number {
  return unit === UnitSystem.metric ? weight : weight * KILOGRAMS_PER_POUND;
}

export function distanceFromMeters(meters: number, unit: UnitSystem): number {
  return unit === UnitSystem.metric ? meters : meters / METERS_PER_FOOT;
}

export function metersFromDistance(distance: number, unit: UnitSystem): number {
  return unit === UnitSystem.metric ? distance : distance * METERS_PER_FOOT;
}

// MARK: - Formatting

/** e.g. "50.0 kg" */
export function formatWeight(kilograms: number, unit: UnitSystem): string {
  return `${printfFixed(weightFromKilograms(kilograms, unit), 1)} ${weightSymbol(unit)}`;
}

/** e.g. "400 m" or "1312.3 ft", from 1 km or 1 mile upwards "42.2 km" or "26.2 mi" */
export function formatDistance(meters: number, unit: UnitSystem): string {
  const value = distanceFromMeters(meters, unit);
  if (unit === UnitSystem.metric && value >= 1000) {
    return `${formatNumber(value / 1000, 2)} km`;
  }
  if (unit === UnitSystem.imperial && value >= FEET_PER_MILE) {
    return `${formatNumber(value / FEET_PER_MILE, 2)} mi`;
  }
  return `${formatNumber(value, 1)} ${distanceSymbol(unit)}`;
}

/** A sum of reps x weight, shortened with k and M, e.g. "12.5k kg" */
export function formatVolume(kilograms: number, unit: UnitSystem): string {
  const volume = weightFromKilograms(kilograms, unit);
  let text: string;
  if (volume < 1000) {
    text = printfFixed(volume, 0);
  } else if (volume < 1_000_000) {
    text = `${printfFixed(volume / 1000, 1)}k`;
  } else {
    text = `${printfFixed(volume / 1_000_000, 2)}M`;
  }
  return `${text} ${weightSymbol(unit)}`;
}

/** For input fields: at most `maxDecimals` decimals without trailing zeros, e.g. "80" or "80.5" (UnitSystem.number) */
export function formatNumber(value: number, maxDecimals: number): string {
  // printf rounds an exact tie to the even digit (6.25 → "6.2"), toFixed away from zero
  let text = printfFixed(value, maxDecimals);
  if (text.includes(".")) {
    text = text.replace(/0+$/, "").replace(/\.$/, "");
  }
  // Deliberately differs from Swift, which shows "-0" for small negative values (e.g. -0.04)
  return text === "-0" ? "0" : text;
}
