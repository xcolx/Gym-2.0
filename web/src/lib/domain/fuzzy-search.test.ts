import { describe, expect, it } from "vitest";

import { exerciseSearchNames } from "./exercise";
import { fuzzyFilter, fuzzyScore } from "./fuzzy-search";

const names = [
  "Bench Press",
  "Incline Bench Press",
  "Overhead Press",
  "Barbell Shoulder Press",
  "Leg Press",
  "Lat Pulldown",
  "Crêpe Curl",
];

const search = (query: string) => fuzzyFilter(names, query, (name) => [name]);

describe("fuzzyScore", () => {
  it("matches exactly, by prefix and contained", () => {
    expect(fuzzyScore("bench", "Bench Press")).not.toBeNull();
    expect(fuzzyScore("pres", "Bench Press")).not.toBeNull();
    expect(fuzzyScore("ench", "Bench Press")).not.toBeNull();
  });

  it("tolerates typos and missing letters", () => {
    expect(fuzzyScore("bnch", "Bench Press")).not.toBeNull();
    expect(fuzzyScore("bnech", "Bench Press")).not.toBeNull();
    expect(fuzzyScore("benchpress", "Bench Press")).not.toBeNull();
    expect(fuzzyScore("bnchprs", "Bench Press")).not.toBeNull();
  });

  it("matches abbreviations that start like a word", () => {
    expect(fuzzyScore("ohp", "Overhead Press")).not.toBeNull();
    expect(fuzzyScore("hpo", "Overhead Press")).toBeNull();
  });

  it("needs every word of the query to match", () => {
    expect(fuzzyScore("bench squat", "Bench Press")).toBeNull();
    expect(fuzzyScore("", "Bench Press")).toBeNull();
  });

  it("ignores case and diacritics", () => {
    expect(fuzzyScore("CREPE", "Crêpe Curl")).not.toBeNull();
  });
});

describe("fuzzyFilter", () => {
  it("ranks names with fewer extra words higher", () => {
    expect(search("bench press")).toEqual(["Bench Press", "Incline Bench Press"]);
  });

  it("ranks equally good matches by name", () => {
    expect(search("press")).toEqual([
      "Bench Press",
      "Leg Press",
      "Overhead Press",
      "Barbell Shoulder Press",
      "Incline Bench Press",
    ]);
  });

  it("ranks exact words above prefixes", () => {
    expect(search("lat")).toEqual(["Lat Pulldown"]);
    expect(fuzzyScore("leg", "Leg Press")!).toBeGreaterThan(fuzzyScore("le", "Leg Press")!);
  });

  it("finds exercises by their aliases, below an equally good match of the shown name", () => {
    const exercises = [
      { name: "Barbell Shoulder Press", aliases: ["Military Press"] },
      { name: "Military Press", aliases: [] },
      { name: "Leg Press", aliases: [] },
    ];
    const result = fuzzyFilter(exercises, "military press", exerciseSearchNames).map((e) => e.name);
    expect(result).toEqual(["Military Press", "Barbell Shoulder Press"]);
  });
});
