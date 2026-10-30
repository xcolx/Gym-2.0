import { describe, expect, it } from "vitest";

import { makeExercise } from "@/test/fixtures";
import { EXERCISE_LIMITS } from "./exercise";
import {
  addAlias,
  aliasProblem,
  defaultTrackedMetrics,
  descriptionProblem,
  exerciseLetter,
  exerciseNameProblem,
  exercisesByLetter,
  isExerciseNameTaken,
  isSameName,
  sortedMetrics,
  trackingFlags,
} from "./exercise-form";
import { characterCount } from "./format";

const noWarnings = { missingSelectionWarning: false, nameTakenWarning: false };

describe("validation", () => {
  it("compares names ignoring case but not accents", () => {
    expect(isSameName("Bench Press", "bench press")).toBe(true);
    expect(isSameName("Curl", "Cürl")).toBe(false);
  });

  it("limits the name in characters, emojis count one", () => {
    expect(exerciseNameProblem("x".repeat(50), noWarnings)).toBeNull();
    expect(exerciseNameProblem("x".repeat(51), noWarnings)).toBe("The name can be at most 50 characters long.");
    expect(exerciseNameProblem("💪".repeat(50), noWarnings)).toBeNull();
  });

  it("warns about a missing or taken name only when asked to", () => {
    expect(exerciseNameProblem("", noWarnings)).toBeNull();
    expect(exerciseNameProblem("", { ...noWarnings, missingSelectionWarning: true })).toBe("Enter a name.");
    expect(exerciseNameProblem("Squat", { ...noWarnings, nameTakenWarning: true })).toBe("Another exercise already has this name.");
    // the length first
    expect(exerciseNameProblem("x".repeat(51), { missingSelectionWarning: true, nameTakenWarning: true })).toMatch(/at most/);
  });

  it("limits aliases and the description", () => {
    expect(aliasProblem("x".repeat(EXERCISE_LIMITS.alias))).toBeNull();
    expect(aliasProblem("x".repeat(EXERCISE_LIMITS.alias + 1))).toBe("Another name can be at most 50 characters long.");
    expect(descriptionProblem("x".repeat(1000))).toBeNull();
    expect(descriptionProblem("x".repeat(1001))).toBe("The description can be at most 1000 characters long.");
  });

  it("knows whether another exercise has exactly the name", () => {
    const exercises = [
      { id: "a", name: "Squat" },
      { id: "b", name: "Bench Press" },
    ];
    expect(isExerciseNameTaken(exercises, "Squat", null)).toBe(true);
    expect(isExerciseNameTaken(exercises, "Squat", "a")).toBe(false);
    expect(isExerciseNameTaken(exercises, "squat", null)).toBe(false);
  });
});

describe("addAlias", () => {
  it("adds a trimmed new alias", () => {
    expect(addAlias(["Fly"], "  Pec Deck ", "Cable Fly")).toEqual(["Fly", "Pec Deck"]);
  });

  it("ignores empty aliases, the name and duplicates in any case, the field is cleared", () => {
    expect(addAlias(["Fly"], "  ", "Cable Fly")).toEqual(["Fly"]);
    expect(addAlias(["Fly"], "cable fly", "Cable Fly")).toEqual(["Fly"]);
    expect(addAlias(["Fly"], "FLY", "Cable Fly")).toEqual(["Fly"]);
  });

  it("can't add a too long alias or more than the maximum number", () => {
    expect(addAlias([], "x".repeat(51), "Name")).toBeNull();
    const full = Array.from({ length: EXERCISE_LIMITS.aliasCount }, (_, index) => `Alias ${index}`);
    expect(addAlias(full, "One more", "Name")).toBeNull();
  });

  it("returns a new list", () => {
    const aliases = ["Fly"];
    expect(addAlias(aliases, "fly", "Name")).not.toBe(aliases);
  });
});

describe("tracked metrics", () => {
  it("doesn't track the weight of resistance bands by default", () => {
    expect(defaultTrackedMetrics("Resistance Band")).toEqual(["reps"]);
    expect(defaultTrackedMetrics("Barbell")).toEqual(["reps", "weights"]);
  });

  it("sorts the metrics in the order they are shown without duplicates", () => {
    expect(sortedMetrics(["distance", "reps", "time", "reps"])).toEqual(["reps", "time", "distance"]);
  });

  it("turns them into the flags of an exercise", () => {
    expect(trackingFlags(["time", "intensity"])).toEqual({
      tracksReps: false,
      tracksWeights: false,
      tracksTime: true,
      tracksIntensity: true,
      tracksDistance: false,
    });
  });
});

describe("list by letter", () => {
  it("uses the first letter without diacritics in upper case, # for others", () => {
    expect(exerciseLetter("Ägyptische Liegestütze")).toBe("A");
    expect(exerciseLetter("  bench")).toBe("B");
    expect(exerciseLetter("élan")).toBe("E");
    expect(exerciseLetter("1RM Test")).toBe("#");
    expect(exerciseLetter("💪 Curl")).toBe("#");
    expect(exerciseLetter("")).toBe("#");
  });

  it("groups by letter in alphabetical order with # last, keeping the order inside a group", () => {
    const groups = exercisesByLetter([{ name: "Squat" }, { name: "21s" }, { name: "Bench" }, { name: "sissy squat" }, { name: "Ab Wheel" }]);
    expect(groups.map((group) => group.letter)).toEqual(["A", "B", "S", "#"]);
    expect(groups[2].exercises.map((exercise) => exercise.name)).toEqual(["Squat", "sissy squat"]);
  });

  it("is empty without exercises", () => {
    expect(exercisesByLetter([])).toEqual([]);
  });
});

describe("exercise form", () => {
  it("validates the lengths", () => {
    expect(characterCount("💪")).toBe(1);
    expect(exerciseNameProblem("a".repeat(51), { missingSelectionWarning: false, nameTakenWarning: false })).toBe(
      "The name can be at most 50 characters long.",
    );
    expect(exerciseNameProblem("", { missingSelectionWarning: true, nameTakenWarning: false })).toBe("Enter a name.");
    expect(exerciseNameProblem("Curl", { missingSelectionWarning: false, nameTakenWarning: true })).toBe(
      "Another exercise already has this name.",
    );
    expect(exerciseNameProblem("Curl", { missingSelectionWarning: true, nameTakenWarning: false })).toBeNull();
    expect(aliasProblem("a".repeat(51))).toBe("Another name can be at most 50 characters long.");
    expect(descriptionProblem("a".repeat(1001))).toBe("The description can be at most 1000 characters long.");
    expect(descriptionProblem("a".repeat(1000))).toBeNull();
  });

  it("adds other names without duplicates", () => {
    expect(addAlias([], " Military Press ", "Shoulder Press")).toEqual(["Military Press"]);
    expect(addAlias(["Military Press"], "military press", "Shoulder Press")).toEqual(["Military Press"]);
    expect(addAlias([], "shoulder press", "Shoulder Press")).toEqual([]);
    expect(addAlias([], "", "Shoulder Press")).toEqual([]);
    expect(addAlias([], "a".repeat(51), "x")).toBeNull();
    expect(addAlias(Array.from({ length: 20 }, (_, i) => `n${i}`), "new", "x")).toBeNull();
    expect(isSameName("Curl", "CURL")).toBe(true);
    expect(isSameName("Curl", "Cürl")).toBe(false);
  });

  it("knows taken names and the default metrics", () => {
    const exercises = [makeExercise({ id: "a", name: "Curl" })];
    expect(isExerciseNameTaken(exercises, "Curl", null)).toBe(true);
    expect(isExerciseNameTaken(exercises, "Curl", "a")).toBe(false);
    expect(isExerciseNameTaken(exercises, "curl", null)).toBe(false);
    expect(defaultTrackedMetrics("Resistance Band")).toEqual(["reps"]);
    expect(defaultTrackedMetrics("Barbell")).toEqual(["reps", "weights"]);
    expect(sortedMetrics(["time", "reps"])).toEqual(["reps", "time"]);
    expect(trackingFlags(["time"])).toEqual({
      tracksReps: false,
      tracksWeights: false,
      tracksTime: true,
      tracksIntensity: false,
      tracksDistance: false,
    });
  });

  it("groups by the first letter with # last", () => {
    expect(exerciseLetter(" ábc")).toBe("A");
    expect(exerciseLetter("21s")).toBe("#");
    const groups = exercisesByLetter([{ name: "Bench" }, { name: "3/4 Sit Up" }, { name: "arnold press" }, { name: "Box Jump" }]);
    expect(groups.map((group) => group.letter)).toEqual(["A", "B", "#"]);
    expect(groups[1].exercises.map((exercise) => exercise.name)).toEqual(["Bench", "Box Jump"]);
  });
});
