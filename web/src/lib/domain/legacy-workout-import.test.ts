import { describe, expect, it } from "vitest";

import { makeExercise, makeWorkout } from "@/test/fixtures";
import { matchLegacyExercises, planLegacyWorkoutImport } from "./legacy-workout-import";
import { NOT_A_LEGACY_FILE_MESSAGE, workoutFileFromLegacyCsv } from "./workout-file";

const shrug = makeExercise({ id: "shrug", name: "Dumbbell Shrug", verified: true });
const pulldown = makeExercise({ id: "pulldown", name: "Lat Pulldown", verified: true });
const pullUp = makeExercise({ id: "pull-up", name: "Pull-Up", verified: true });
const crunches = makeExercise({ id: "crunches", name: "Crunches", verified: true });
const abduction = makeExercise({ id: "abduction", name: "Hip Abduction", verified: true });
const adduction = makeExercise({ id: "adduction", name: "Hip Adduction Machine", verified: true });
const ohp = makeExercise({ id: "ohp", name: "Barbell Shoulder Press", aliases: ["Military Press"], verified: true });
const exercises = [shrug, pulldown, pullUp, crunches, abduction, adduction, ohp];

describe("matchLegacyExercises", () => {
  it("matches plurals, punctuation, spaces, word order, prefixes and aliases", () => {
    const matches = matchLegacyExercises(
      ["Dumbbell Shrugs", "Lat Pull Down", "Pull Ups", "Crunch", "Press Military", "Shrug Dumbbell"],
      exercises,
    );
    expect(Object.fromEntries([...matches].map(([name, exercise]) => [name, exercise.id]))).toEqual({
      "Dumbbell Shrugs": "shrug",
      "Lat Pull Down": "pulldown",
      "Pull Ups": "pull-up",
      Crunch: "crunches",
      "Press Military": "ohp",
      "Shrug Dumbbell": "shrug",
    });
  });

  it("doesn't tolerate typos or extra words", () => {
    const matches = matchLegacyExercises(["Hip Abduction Machine", "Steinheben (Swiss)", "Shrug"], exercises);
    expect(matches.size).toBe(0);
  });

  it("prefers the verified exercise if a custom one has the same name", () => {
    const custom = makeExercise({ id: "custom", name: "Dumbbell Shrug", verified: false });
    expect(matchLegacyExercises(["Dumbbell Shrugs"], [custom, shrug]).get("Dumbbell Shrugs")?.id).toBe("shrug");
  });
});

const LEGACY_CSV = `ID; Name; Date; Time; Exercise; Unilateral; Reps; Weight; Index
0C42E389-4BF8-4B6F-A990-9274EEB84CB3;Pull;2026-10-03 14:30:45 +0000;98;Lat Pull Down;false;[12, 10];[60.0, 60.0];1
0C42E389-4BF8-4B6F-A990-9274EEB84CB3;Pull;2026-10-03 14:30:45 +0000;98;Dumbbell Shrugs;true;[9, 9];[23.0, 23.0];0
D6AE2CC8-E1A3-4977-958D-0A0344CAB8F2;Stones;2026-10-01 17:26:45 +0000;117;Steinheben (Swiss);false;[7];[60.0];0
D6AE2CC8-E1A3-4977-958D-0A0344CAB8F2;Stones;2026-10-01 17:26:45 +0000;117;Pull Ups;false;[7];[80.0];1
`;

describe("planLegacyWorkoutImport", () => {
  it("imports only the workouts of which every exercise is matched", () => {
    const plan = planLegacyWorkoutImport(workoutFileFromLegacyCsv(LEGACY_CSV), exercises, [], "en-US");
    expect(plan.totalCount).toBe(2);
    expect(plan.workouts).toHaveLength(1);
    expect(plan.workouts[0].name).toBe("Pull");
    expect(plan.workouts[0].exercises.map((exercise) => exercise.exerciseId)).toEqual(["shrug", "pulldown"]);
    expect(plan.workouts[0].exercises[0].unilateral).toBe(true);
    expect(plan.unmatchedExerciseNames).toEqual(["Steinheben (Swiss)"]);
    expect(plan.unmatchedWorkoutCount).toBe(1);
    expect(plan.renamedExercises).toEqual([
      { legacyName: "Dumbbell Shrugs", exerciseName: "Dumbbell Shrug" },
      { legacyName: "Lat Pull Down", exerciseName: "Lat Pulldown" },
      { legacyName: "Pull Ups", exerciseName: "Pull-Up" },
    ]);
  });

  it("skips workouts that were imported before", () => {
    const existing = makeWorkout({ name: "Pull", date: new Date("2026-10-03T14:30:45Z") });
    const plan = planLegacyWorkoutImport(workoutFileFromLegacyCsv(LEGACY_CSV), exercises, [existing], "en-US");
    expect(plan.workouts).toHaveLength(0);
    expect(plan.existingCount).toBe(1);
  });

  it("rejects files of this version", () => {
    expect(() => workoutFileFromLegacyCsv("Workout ID;Workout;Date\n")).toThrow(NOT_A_LEGACY_FILE_MESSAGE);
  });
});
