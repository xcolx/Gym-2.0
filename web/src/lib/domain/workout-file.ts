// Port of ios/Gym 2.0/Features/Stats/ImportExport/WorkoutFile.swift. The files are byte for byte the ones of the iOS
// app, so they can move between iOS and the web: the JSON is written like Swift's JSONEncoder and the CSV numbers like
// String(format: "%.2f").

import { SET_METRICS, type Exercise, type SetMetric, type Workout, type WorkoutWithExercises } from "@/types/models";
import { exerciseTrackedMetrics, isInRange, SET_METRIC_SERVER_RANGES } from "./set-metric";
import { newUUID } from "@/lib/uuid";
import { appLocale, prefixCharacters } from "./format";
import { printfFixed } from "./printf";
import { MAX_WORKOUT_NAME_LENGTH } from "./workout";
import { entryCount, type SetArrays } from "./workout-exercise";

const WORKOUT_FILE_FORMAT_NAME = "gym2-workouts";

export interface WorkoutFileUnits {
  weight: string;
  distance: string;
  time: string;
  duration: string;
}

export interface WorkoutFile {
  format: string;
  version: number;
  units: WorkoutFileUnits;
  workouts: WorkoutFileWorkout[];
}

export interface WorkoutFileWorkout {
  /**
   * The client UUID of the workout when it was exported (uppercase, like Swift's uuidString), so a workout that still
   * exists isn't imported again. Imported workouts get a new UUID: the server keeps the UUIDs of deleted workouts and
   * would return the deleted workout instead of creating it again.
   */
  id: string;
  name: string;
  date: Date;
  durationMinutes: number;
  exercises: WorkoutFileExercise[];
}

interface WorkoutFileExercise {
  exercise: string;
  unilateral: boolean;
  sets: WorkoutFileSet[];
}

interface WorkoutFileSet {
  /** "R" or "L" for unilateral exercises */
  side: string | null;
  reps: number | null;
  weight: number | null;
  time: number | null;
  intensity: number | null;
  distance: number | null;
}

/** The message is shown to the user */
export class WorkoutFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkoutFileError";
  }
}

// The localizedDescription of Swift's DecodingError, which the iOS import shows
export const DECODING_MISSING_MESSAGE = "The data couldn’t be read because it is missing.";
export const DECODING_FORMAT_MESSAGE = "The data couldn’t be read because it isn’t in the correct format.";
const ENCODING_FORMAT_MESSAGE = "The data couldn’t be written because it isn’t in the correct format.";
export const NOT_A_WORKOUT_FILE_MESSAGE = "This is not a Gym 2.0 workout file.";
export const NOT_A_LEGACY_FILE_MESSAGE = "This is not a CSV file exported from an earlier version of Gym 2.0.";

const DEFAULT_WORKOUT_FILE_UNITS: WorkoutFileUnits = { weight: "kg", distance: "m", time: "s", duration: "min" };

const emptySet = (side: string | null = null): WorkoutFileSet => ({
  side,
  reps: null,
  weight: null,
  time: null,
  intensity: null,
  distance: null,
});

// MARK: - From the models

/** The workouts as a file, the oldest first (`WorkoutFile(workouts:)`) */
export function workoutFileFromWorkouts(workouts: readonly WorkoutWithExercises[]): WorkoutFile {
  return {
    format: WORKOUT_FILE_FORMAT_NAME,
    version: 1,
    units: { ...DEFAULT_WORKOUT_FILE_UNITS },
    workouts: [...workouts]
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((workout) => ({
        id: workout.clientUUID.toUpperCase(),
        name: workout.name,
        date: workout.date,
        durationMinutes: workout.duration,
        exercises: [...workout.workoutExercises]
          .sort((a, b) => a.index - b.index)
          .map((workoutExercise) => ({
            exercise: workoutExercise.exercise?.name ?? "",
            unilateral: workoutExercise.unilateral,
            sets: Array.from({ length: entryCount(workoutExercise) }, (_, index) => ({
              side: workoutExercise.unilateral ? (index % 2 === 0 ? "R" : "L") : null,
              reps: workoutExercise.reps?.[index] ?? null,
              weight: workoutExercise.weights?.[index] ?? null,
              time: workoutExercise.time?.[index] ?? null,
              intensity: workoutExercise.intensity?.[index] ?? null,
              distance: workoutExercise.distance?.[index] ?? null,
            })),
          })),
      })),
  };
}

// MARK: - Numbers and dates like Foundation

export { printfFixed };

/** `Double.description` of Swift as JSONEncoder writes it: shortest form, "50" instead of "50.0", "1e-05" */
export function swiftDoubleJson(value: number): string {
  if (!Number.isFinite(value)) throw new WorkoutFileError(ENCODING_FORMAT_MESSAGE);
  if (Object.is(value, -0)) return "-0";
  if (value === 0) return "0";
  const [mantissa, exponentText] = value.toExponential().split("e");
  const exponent = Number(exponentText);
  // Swift switches to the exponential form below 0.0001 and above 2^54
  if (exponent < -4 || Math.abs(value) > 2 ** 54) {
    const sign = exponent < 0 ? "-" : "+";
    return `${mantissa}e${sign}${String(Math.abs(exponent)).padStart(2, "0")}`;
  }
  return String(value);
}

/** An integer like Swift's Int, reps and times are stored as integers */
function intText(value: number): string {
  return String(Math.round(value));
}

/** `UnitSystem.number(_:maxDecimals:)` of Units.swift: printf, then without trailing zeros */
export function swiftNumber(value: number, maxDecimals: number): string {
  let text = printfFixed(value, maxDecimals);
  if (text.includes(".")) text = text.replace(/0+$/, "").replace(/\.$/, "");
  return text;
}

const pad = (value: number, length = 2) => String(value).padStart(length, "0");

/** ISO8601DateFormatter / JSONEncoder's .iso8601: UTC, whole seconds, e.g. "2026-10-13T08:05:00Z" */
export function iso8601String(date: Date): string {
  const truncated = new Date(Math.floor(date.getTime() / 1000) * 1000);
  return (
    `${pad(truncated.getUTCFullYear(), 4)}-${pad(truncated.getUTCMonth() + 1)}-${pad(truncated.getUTCDate())}` +
    `T${pad(truncated.getUTCHours())}:${pad(truncated.getUTCMinutes())}:${pad(truncated.getUTCSeconds())}Z`
  );
}

/** An ISO 8601 internet date time ("Z" or an offset), with optional fractional seconds. Null if invalid. */
export function parseIso8601(text: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|z|[+-]\d{2}:?\d{2})$/.exec(text);
  if (!match) return null;
  const [, year, month, day, hours, minutes, seconds, fraction, zone] = match;
  let offsetMinutes = 0;
  if (zone !== "Z" && zone !== "z") {
    const digits = zone.replace(":", "");
    offsetMinutes = (zone[0] === "-" ? -1 : 1) * (Number(digits.slice(1, 3)) * 60 + Number(digits.slice(3, 5)));
  }
  const time = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes), Number(seconds));
  const date = new Date(time - offsetMinutes * 60_000 + (fraction ? Math.floor(Number(fraction) * 1000) : 0));
  // Rejects e.g. the 31st of February, which Date.UTC would move to March
  const check = new Date(time);
  if (check.getUTCMonth() !== Number(month) - 1 || check.getUTCDate() !== Number(day)) return null;
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The legacy CSV's "yyyy-MM-dd HH:mm:ss Z", e.g. "2024-09-10 18:30:00 +0000". Null if invalid. */
function parseLegacyDate(text: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}) ?(Z|[+-]\d{2}:?\d{2})$/.exec(text);
  if (!match) return null;
  return parseIso8601(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}${match[7]}`);
}

/** Swift's `Int(String)`: optional sign and digits only */
function parseSwiftInt(text: string): number | null {
  if (!/^[+-]?\d+$/.test(text)) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) ? value : null;
}

/** Swift's `Double(String)`: a decimal number (also "5." and ".5"), "inf", "infinity" or "nan" */
function parseSwiftDouble(text: string): number | null {
  if (/^[+-]?((\d+\.?\d*|\.\d+)([eE][+-]?\d+)?)$/.test(text)) return Number(text);
  const special = /^([+-]?)(inf|infinity|nan)$/i.exec(text);
  if (!special) return null;
  if (special[2].toLowerCase() === "nan") return Number.NaN;
  return special[1] === "-" ? -Infinity : Infinity;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Swift's `UUID(uuidString:)`, as its uuidString (uppercase), null if invalid */
function parseUUID(text: string): string | null {
  return UUID_PATTERN.test(text) ? text.toUpperCase() : null;
}

/** `trimmingCharacters(in: .whitespaces)`: spaces and tabs, no line breaks */
function trimWhitespace(text: string): string {
  return text.replace(/^[\t\p{Zs}]+|[\t\p{Zs}]+$/gu, "");
}

// MARK: - JSON

/** A number already written as JSON */
class JsonNumber {
  constructor(readonly text: string) {}
}

type JsonValue = string | boolean | JsonNumber | JsonValue[] | { [key: string]: JsonValue };

/** JSONWriter.serializeString: escapes the slash like JSONEncoder does by default */
function jsonString(text: string): string {
  let result = '"';
  for (const character of text) {
    const code = character.codePointAt(0)!;
    switch (character) {
      case '"':
        result += '\\"';
        break;
      case "\\":
        result += "\\\\";
        break;
      case "\n":
        result += "\\n";
        break;
      case "\r":
        result += "\\r";
        break;
      case "\t":
        result += "\\t";
        break;
      case "\b":
        result += "\\b";
        break;
      case "\f":
        result += "\\f";
        break;
      case "/":
        result += "\\/";
        break;
      default:
        result += code <= 0x1f ? `\\u${code.toString(16).padStart(4, "0")}` : character;
    }
  }
  return result + '"';
}

/** JSONEncoder's .prettyPrinted + .sortedKeys: two spaces, " : ", and "[\n\n]" for empty arrays */
function serializeJson(value: JsonValue, indent = ""): string {
  if (typeof value === "string") return jsonString(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof JsonNumber) return value.text;
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    return `[\n${value.map((item) => inner + serializeJson(item, inner)).join(",\n")}\n${indent}]`;
  }
  const keys = Object.keys(value).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return `{\n${keys.map((key) => `${inner}${jsonString(key)} : ${serializeJson(value[key], inner)}`).join(",\n")}\n${indent}}`;
}

/** The JSON of the file, exactly as the iOS app writes it (`WorkoutFile.json()`) */
export function workoutFileToJson(file: WorkoutFile): string {
  const optional = (entries: [string, JsonValue | null][]) =>
    Object.fromEntries(entries.filter((entry): entry is [string, JsonValue] => entry[1] !== null));
  const double = (value: number | null) => (value === null ? null : new JsonNumber(swiftDoubleJson(value)));
  const int = (value: number | null) => (value === null ? null : new JsonNumber(intText(value)));

  const root: JsonValue = {
    format: file.format,
    version: new JsonNumber(intText(file.version)),
    units: { ...file.units },
    workouts: file.workouts.map((workout) => ({
      id: workout.id.toUpperCase(),
      name: workout.name,
      date: iso8601String(workout.date),
      duration_minutes: new JsonNumber(intText(workout.durationMinutes)),
      exercises: workout.exercises.map((exercise) => ({
        exercise: exercise.exercise,
        unilateral: exercise.unilateral,
        sets: exercise.sets.map((set) =>
          optional([
            ["side", set.side],
            ["reps", int(set.reps)],
            ["weight", double(set.weight)],
            ["time", int(set.time)],
            ["intensity", double(set.intensity)],
            ["distance", double(set.distance)],
          ]),
        ),
      })),
    })),
  };
  return serializeJson(root);
}

/** JSONDecoder's .convertFromSnakeCase: "duration_minutes" → "durationMinutes", leading/trailing "_" stay */
function camelCaseKey(key: string): string {
  const match = /^(_*)([\s\S]*?)(_*)$/.exec(key)!;
  const [, leading, core, trailing] = match;
  if (!core.includes("_")) return key;
  const parts = core.split("_").filter((part) => part.length > 0);
  const capitalized = parts.slice(1).map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase());
  return leading + [parts[0].toLowerCase(), ...capitalized].join("") + trailing;
}

type Decoded = Record<string, unknown>;

/** A decoding error of Swift: missing (keyNotFound, valueNotFound) or wrong (typeMismatch, dataCorrupted) */
const missing = () => new WorkoutFileError(DECODING_MISSING_MESSAGE);
const corrupted = () => new WorkoutFileError(DECODING_FORMAT_MESSAGE);

function container(value: unknown): Decoded {
  if (value === null || value === undefined) throw missing();
  if (typeof value !== "object" || Array.isArray(value)) throw corrupted();
  const result: Decoded = {};
  for (const [key, item] of Object.entries(value as Decoded)) result[camelCaseKey(key)] = item;
  return result;
}

function array(value: unknown): unknown[] {
  if (value === null || value === undefined) throw missing();
  if (!Array.isArray(value)) throw corrupted();
  return value;
}

function decodeString(value: unknown): string {
  if (value === null || value === undefined) throw missing();
  if (typeof value !== "string") throw corrupted();
  return value;
}

function decodeBool(value: unknown): boolean {
  if (value === null || value === undefined) throw missing();
  if (typeof value !== "boolean") throw corrupted();
  return value;
}

function decodeDouble(value: unknown): number {
  if (value === null || value === undefined) throw missing();
  if (typeof value !== "number") throw corrupted();
  return value;
}

/** Int: a number without fraction ("10.0" is accepted like by JSONDecoder, "10.5" isn't) */
function decodeInt(value: unknown): number {
  const number = decodeDouble(value);
  if (!Number.isSafeInteger(number)) throw corrupted();
  return number;
}

/** decodeIfPresent: missing and null are nil */
function optionalValue<T>(value: unknown, decode: (value: unknown) => T): T | null {
  return value === null || value === undefined ? null : decode(value);
}

/** Reads the JSON of the iOS app or the web (`WorkoutFile(json:)`), throws a WorkoutFileError */
export function workoutFileFromJson(text: string): WorkoutFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw corrupted();
  }
  // In the order of the properties, like the synthesized init(from:)
  const root = container(raw);
  const format = decodeString(root.format);
  const version = decodeInt(root.version);
  const unitsContainer = container(root.units);
  const file: WorkoutFile = {
    format,
    version,
    units: {
      weight: decodeString(unitsContainer.weight),
      distance: decodeString(unitsContainer.distance),
      time: decodeString(unitsContainer.time),
      duration: decodeString(unitsContainer.duration),
    },
    workouts: array(root.workouts).map((item) => {
      const workout = container(item);
      const id = parseUUID(decodeString(workout.id));
      if (id === null) throw corrupted();
      const name = decodeString(workout.name);
      const date = parseIso8601(decodeString(workout.date));
      if (date === null) throw corrupted();
      return {
        id,
        name,
        date,
        durationMinutes: decodeInt(workout.durationMinutes),
        exercises: array(workout.exercises).map((exerciseItem) => {
          const exercise = container(exerciseItem);
          return {
            exercise: decodeString(exercise.exercise),
            unilateral: decodeBool(exercise.unilateral),
            sets: array(exercise.sets).map((setItem) => {
              const set = container(setItem);
              return {
                side: optionalValue(set.side, decodeString),
                reps: optionalValue(set.reps, decodeInt),
                weight: optionalValue(set.weight, decodeDouble),
                time: optionalValue(set.time, decodeInt),
                intensity: optionalValue(set.intensity, decodeDouble),
                distance: optionalValue(set.distance, decodeDouble),
              };
            }),
          };
        }),
      };
    }),
  };
  if (file.format !== WORKOUT_FILE_FORMAT_NAME) throw new WorkoutFileError(NOT_A_WORKOUT_FILE_MESSAGE);
  return file;
}

// MARK: - CSV

/** One row per entry of a set, separated by semicolons */
const CSV_HEADER = [
  "Workout ID",
  "Workout",
  "Date",
  "Duration (min)",
  "Exercise No.",
  "Exercise",
  "Unilateral",
  "Set",
  "Side",
  "Reps",
  "Weight (kg)",
  "Time (s)",
  "Intensity",
  "Distance (m)",
] as const;

/** The header of the CSV files of earlier versions, with reps and weights as arrays per exercise */
const LEGACY_CSV_COLUMN_COUNT = 9;

/** Swift's Character.isNewline ("\r\n" is one character there) */
const isNewline = (character: string) => /^(\r\n|[\n\r\u000B\u000C\u0085\u2028\u2029])$/.test(character);

/** Quoted if it contains a separator, a quote or a line break */
function escapeCsv(field: string): string {
  if (!/[;"\n\r\u000B\u000C\u0085\u2028\u2029]/.test(field)) return field;
  return `"${field.replaceAll('"', '""')}"`;
}

/** The CSV of the file, exactly as the iOS app writes it (`WorkoutFile.csv()`) */
export function workoutFileToCsv(file: WorkoutFile): string {
  const rows: string[][] = [[...CSV_HEADER]];
  for (const workout of file.workouts) {
    workout.exercises.forEach((exercise, exerciseIndex) => {
      exercise.sets.forEach((set, index) => {
        rows.push([
          workout.id.toUpperCase(),
          workout.name,
          iso8601String(workout.date),
          intText(workout.durationMinutes),
          String(exerciseIndex + 1),
          exercise.exercise,
          exercise.unilateral ? "true" : "false",
          String(exercise.unilateral ? Math.trunc(index / 2) + 1 : index + 1),
          set.side ?? "",
          set.reps === null ? "" : intText(set.reps),
          set.weight === null ? "" : swiftNumber(set.weight, 2),
          set.time === null ? "" : intText(set.time),
          set.intensity === null ? "" : swiftNumber(set.intensity, 2),
          set.distance === null ? "" : swiftNumber(set.distance, 3),
        ]);
      });
    });
  }
  return rows.map((row) => row.map(escapeCsv).join(";")).join("\n") + "\n";
}

/** Rows of semicolon separated fields, fields can be quoted with double quotes (`parseCSV`) */
export function parseCsv(text: string): string[][] {
  // Characters like Swift's: "\r\n" is one
  const characters = text.match(/\r\n|[\s\S]/gu) ?? [];
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let isQuoted = false;

  for (let i = 0; i < characters.length; i++) {
    const character = characters[i];
    if (isQuoted) {
      if (character === '"') {
        if (characters[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          isQuoted = false;
        }
      } else {
        field += character;
      }
    } else if (character === '"' && field === "") {
      isQuoted = true;
    } else if (character === ";") {
      row.push(field);
      field = "";
    } else if (isNewline(character)) {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Reads the CSV of this version and the one of earlier versions (`WorkoutFile(csv:)`), throws a WorkoutFileError */
export function workoutFileFromCsv(text: string): WorkoutFile {
  const rows = parseCsv(text).filter((row) => !row.every((cell) => trimWhitespace(cell) === ""));
  const header = rows[0];
  if (!header) throw new WorkoutFileError("The file is empty.");
  let workouts: WorkoutFileWorkout[];
  if (trimWhitespace(header[0] ?? "") === CSV_HEADER[0]) {
    workouts = workoutsFromRows(rows.slice(1));
  } else if (header.length === LEGACY_CSV_COLUMN_COUNT) {
    workouts = workoutsFromLegacyRows(rows.slice(1));
  } else {
    throw new WorkoutFileError(NOT_A_WORKOUT_FILE_MESSAGE);
  }
  return { format: WORKOUT_FILE_FORMAT_NAME, version: 1, units: { ...DEFAULT_WORKOUT_FILE_UNITS }, workouts };
}

/**
 * Reads only the CSV of earlier versions, for the legacy import (`WorkoutFile(legacyCSV:)`), throws a
 * WorkoutFileError
 */
export function workoutFileFromLegacyCsv(text: string): WorkoutFile {
  const rows = parseCsv(text).filter((row) => !row.every((cell) => trimWhitespace(cell) === ""));
  const header = rows[0];
  if (!header) throw new WorkoutFileError("The file is empty.");
  if (header.length !== LEGACY_CSV_COLUMN_COUNT || trimWhitespace(header[0]) !== "ID") {
    throw new WorkoutFileError(NOT_A_LEGACY_FILE_MESSAGE);
  }
  return {
    format: WORKOUT_FILE_FORMAT_NAME,
    version: 1,
    units: { ...DEFAULT_WORKOUT_FILE_UNITS },
    workouts: workoutsFromLegacyRows(rows.slice(1)),
  };
}

function workoutsFromRows(rows: string[][]): WorkoutFileWorkout[] {
  const workouts: WorkoutFileWorkout[] = [];
  const byId = new Map<string, WorkoutFileWorkout>();
  // The exercise number of the last exercise of every workout, a new number starts a new exercise
  const lastExerciseNumber = new Map<string, string>();

  rows.forEach((row, rowIndex) => {
    if (row.length !== CSV_HEADER.length) {
      throw new WorkoutFileError(`Row ${rowIndex + 2} doesn't have ${CSV_HEADER.length} columns.`);
    }
    const cell = (index: number) => trimWhitespace(row[index]);
    const id = parseUUID(cell(0));
    const date = parseIso8601(cell(2));
    if (id === null || date === null) {
      throw new WorkoutFileError(`Row ${rowIndex + 2} has an invalid workout id or date.`);
    }

    let workout = byId.get(id);
    if (!workout) {
      workout = { id, name: cell(1), date, durationMinutes: parseSwiftInt(cell(3)) ?? 0, exercises: [] };
      byId.set(id, workout);
      workouts.push(workout);
    }
    if (lastExerciseNumber.get(id) !== cell(4)) {
      lastExerciseNumber.set(id, cell(4));
      workout.exercises.push({ exercise: cell(5), unilateral: cell(6).toLowerCase() === "true", sets: [] });
    }
    workout.exercises[workout.exercises.length - 1].sets.push({
      side: cell(8) === "" ? null : cell(8),
      reps: parseSwiftInt(cell(9)),
      weight: parseSwiftDouble(cell(10)),
      time: parseSwiftInt(cell(11)),
      intensity: parseSwiftDouble(cell(12)),
      distance: parseSwiftDouble(cell(13)),
    });
  });
  return workouts;
}

/** ID; Name; Date; Time; Exercise; Unilateral; Reps; Weight; Index, with reps and weights as "[10, 8]" */
function workoutsFromLegacyRows(rows: string[][]): WorkoutFileWorkout[] {
  const numbers = (text: string, convert: (text: string) => number | null): number[] =>
    text
      .replace(/^[[\] ]+|[[\] ]+$/g, "")
      .split(",")
      .filter((part) => part.length > 0)
      .map((part) => convert(trimWhitespace(part)))
      .filter((value): value is number => value !== null);

  const workouts: WorkoutFileWorkout[] = [];
  const exercisesByWorkout = new Map<string, { index: number; entry: WorkoutFileExercise }[]>();
  for (const row of rows) {
    if (row.length !== LEGACY_CSV_COLUMN_COUNT) continue;
    const cells = row.map(trimWhitespace);
    // An invalid id makes the row a workout of its own, like UUID() in Swift
    const id = parseUUID(cells[0]) ?? newUUID().toUpperCase();
    if (!workouts.some((workout) => workout.id === id)) {
      workouts.push({
        id,
        name: cells[1],
        date: parseLegacyDate(cells[2]) ?? new Date(),
        durationMinutes: parseSwiftInt(cells[3]) ?? 0,
        exercises: [],
      });
    }
    // Bool("true") / Bool("false") of Swift, case sensitive
    const unilateral = cells[5] === "true";
    const reps = numbers(cells[6], parseSwiftInt);
    const weights = numbers(cells[7], parseSwiftDouble);
    const sets = Array.from({ length: Math.max(reps.length, weights.length) }, (_, index) => ({
      ...emptySet(unilateral ? (index % 2 === 0 ? "R" : "L") : null),
      reps: index < reps.length ? reps[index] : null,
      weight: index < weights.length ? weights[index] : null,
    }));
    const list = exercisesByWorkout.get(id) ?? [];
    list.push({ index: parseSwiftInt(cells[8]) ?? 0, entry: { exercise: cells[4], unilateral, sets } });
    exercisesByWorkout.set(id, list);
  }
  for (const workout of workouts) {
    workout.exercises = (exercisesByWorkout.get(workout.id) ?? [])
      .sort((a, b) => a.index - b.index)
      .map((item) => item.entry);
  }
  return workouts;
}

// MARK: - Reading a selected file

const WHITESPACE_BYTES = new Set([0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0x85, 0xa0]);

/**
 * Reads a selected file like ImportWorkoutsViewModel.importFile: JSON if it ends with .json or starts with "{",
 * CSV otherwise. Throws a WorkoutFileError with the message to show.
 */
export function readWorkoutFile(fileName: string, bytes: Uint8Array): WorkoutFile {
  const extension = fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase() : "";
  const firstByte = bytes.find((byte) => !WHITESPACE_BYTES.has(byte));
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    if (extension === "json" || firstByte === 0x7b) throw corrupted();
    throw new WorkoutFileError("Could not read the file.");
  }
  if (extension === "json" || firstByte === 0x7b) return workoutFileFromJson(text);
  return workoutFileFromCsv(text);
}

/** Reads a selected CSV file of an earlier version (`LegacyWorkoutImport`), throws a WorkoutFileError */
export function readLegacyWorkoutFile(bytes: Uint8Array): WorkoutFile {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new WorkoutFileError("Could not read the file.");
  }
  return workoutFileFromLegacyCsv(text);
}

// MARK: - Export

export type ExportFormat = "csv" | "json";

export const EXPORT_FORMATS: { format: ExportFormat; title: string; explanation: string; mimeType: string }[] = [
  {
    format: "csv",
    title: "CSV",
    explanation: "One row per set, for spreadsheets like Excel or Numbers.",
    mimeType: "text/csv",
  },
  {
    format: "json",
    title: "JSON",
    explanation: "All workouts with their exercises and sets, for other apps and backups.",
    mimeType: "application/json",
  },
];

/** "Gym 2.0 Workouts 2026-10-15.csv", the date in UTC like `Date.now.formatted(.iso8601.year().month().day())` */
export function exportFileName(format: ExportFormat, now: Date = new Date()): string {
  return `Gym 2.0 Workouts ${iso8601String(now).slice(0, 10)}.${format}`;
}

/** The content of the exported file (`WorkoutExportView.writeFile`) */
export function exportWorkouts(workouts: readonly WorkoutWithExercises[], format: ExportFormat): string {
  const file = workoutFileFromWorkouts(workouts);
  return format === "csv" ? workoutFileToCsv(file) : workoutFileToJson(file);
}

// MARK: - To the models

/** The limits of the server, see backend/app/schemas/workouts.py */
const LIMITS = { exercises: 100, entries: 100, duration: { min: 0, max: 1440 } };

/** A workout to insert, the shape of `ImportedWorkout` of lib/repo/workouts */
export interface PlannedImportWorkout {
  name: string;
  date: Date;
  duration: number;
  exercises: { exerciseId: string; unilateral: boolean; sets: SetArrays }[];
}

export interface WorkoutImportPlan {
  workouts: PlannedImportWorkout[];
  /** Exercises of the file that don't exist, they are left out (sorted) */
  missingExerciseNames: string[];
  /** Workouts that exist already, e.g. a file that is imported a second time */
  existingCount: number;
  /** Workouts with values the server doesn't accept, e.g. negative reps or more than 100 sets, they are left out */
  invalidWorkouts: string[];
}

/** `date.formatted(date: .abbreviated, time: .omitted)`, e.g. "Oct 13, 2026" */
function abbreviatedDate(date: Date, locale: string = appLocale()): string {
  return date.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
}

function setValue(set: WorkoutFileSet, metric: SetMetric): number | null {
  switch (metric) {
    case "reps":
      return set.reps;
    case "weights":
      return set.weight;
    case "time":
      return set.time;
    case "intensity":
      return set.intensity;
    case "distance":
      return set.distance;
  }
}

/** Whether the server accepts the values the exercise tracks, a missing value is imported as 0 */
function setFits(set: WorkoutFileSet, exercise: Exercise): boolean {
  return exerciseTrackedMetrics(exercise).every((metric) =>
    isInRange(setValue(set, metric) ?? 0, SET_METRIC_SERVER_RANGES[metric]),
  );
}

/**
 * The workouts of the file to insert (`makeWorkouts(context:)`). Values the exercise doesn't track are left out,
 * tracked values missing in the file are 0. `existingWorkouts` are all local workouts, also the ones in progress.
 */
export function planWorkoutImport(
  file: WorkoutFile,
  exercises: readonly Exercise[],
  existingWorkouts: readonly Workout[],
  locale?: string,
): WorkoutImportPlan {
  // Verified exercises first, if a custom exercise has the same name
  const exercisesByName = new Map<string, Exercise>();
  for (const exercise of [...exercises].sort((a, b) => Number(b.verified) - Number(a.verified))) {
    if (!exercisesByName.has(exercise.name)) exercisesByName.set(exercise.name, exercise);
  }
  const existingIds = new Set(existingWorkouts.map((workout) => workout.clientUUID.toLowerCase()));

  const plan: WorkoutImportPlan = { workouts: [], missingExerciseNames: [], existingCount: 0, invalidWorkouts: [] };
  const missing = new Set<string>();
  for (const entry of file.workouts) {
    const name = prefixCharacters(entry.name, MAX_WORKOUT_NAME_LENGTH);
    // Exported from this account, or imported before and recognized by its name and start since it got a new UUID
    const exists =
      existingIds.has(entry.id.toLowerCase()) ||
      existingWorkouts.some(
        (workout) => workout.name === name && Math.abs(workout.date.getTime() - entry.date.getTime()) < 1000,
      );
    if (exists) {
      plan.existingCount += 1;
      continue;
    }
    // Checked before anything is created, so nothing of a workout that is left out is imported
    const toImport: { entry: WorkoutFileExercise; exercise: Exercise; sets: WorkoutFileSet[] }[] = [];
    for (const exerciseEntry of entry.exercises) {
      const exercise = exercisesByName.get(exerciseEntry.exercise);
      if (!exercise) {
        missing.add(exerciseEntry.exercise);
        continue;
      }
      const sets = [...exerciseEntry.sets];
      // A unilateral set always has a right and a left entry
      if (exerciseEntry.unilateral && sets.length % 2 === 1) sets.push(emptySet("L"));
      if (sets.length === 0) continue;
      toImport.push({ entry: exerciseEntry, exercise, sets });
    }
    if (toImport.length === 0) continue;
    const isValid =
      toImport.length <= LIMITS.exercises &&
      toImport.every(
        (item) => item.sets.length <= LIMITS.entries && item.sets.every((set) => setFits(set, item.exercise)),
      );
    if (!isValid) {
      plan.invalidWorkouts.push(`${name} (${abbreviatedDate(entry.date, locale)})`);
      continue;
    }

    const values = (sets: WorkoutFileSet[], metric: SetMetric) => sets.map((set) => setValue(set, metric) ?? 0);
    plan.workouts.push({
      name,
      date: entry.date,
      duration: Math.min(Math.max(entry.durationMinutes, LIMITS.duration.min), LIMITS.duration.max),
      exercises: toImport.map(({ entry: exerciseEntry, exercise, sets }) => {
        const tracked = new Set(exerciseTrackedMetrics(exercise));
        const arrays = Object.fromEntries(
          SET_METRICS.map((metric) => [metric, tracked.has(metric) ? values(sets, metric) : null]),
        ) as SetArrays;
        return { exerciseId: exercise.id, unilateral: exerciseEntry.unilateral, sets: arrays };
      }),
    });
  }
  plan.missingExerciseNames = [...missing].sort();
  return plan;
}
