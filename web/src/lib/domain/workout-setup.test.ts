import { describe, expect, it } from "vitest";

import { equipment, makeExercise, muscles, reference } from "@/test/fixtures";

import {
  exerciseCountText,
  exerciseDetailsText,
  formatWorkoutMinutes,
  isAlwaysAvailable,
  moved,
  musclesWorked,
  pickedPositions,
  schemeDetails,
  withoutLastPick,
} from "./workout-setup";

describe("musclesWorked", () => {
  it("lists a muscle trained as primary muscle by any exercise only as primary muscle", () => {
    const worked = musclesWorked(
      [
        makeExercise({ primaryMuscleIds: [1], secondaryMuscleIds: [2, 3] }),
        makeExercise({ primaryMuscleIds: [3], secondaryMuscleIds: [4] }),
      ],
      muscles,
    );
    expect(worked.primary.map((muscle) => muscle.name)).toEqual(["Chest", "Front Deltoid"]);
    expect(worked.secondary.map((muscle) => muscle.name)).toEqual(["Triceps", "Quads"]);
  });

  it("is empty without exercises", () => {
    expect(musclesWorked([], muscles)).toEqual({ primary: [], secondary: [] });
  });
});

describe("texts", () => {
  it("counts the exercises", () => {
    expect(exerciseCountText(1)).toBe("1 exercise");
    expect(exerciseCountText(0)).toBe("0 exercises");
  });

  it("says when a saved workout was last done", () => {
    const now = new Date(2026, 10, 5, 12);
    expect(schemeDetails(3, new Date(2026, 10, 3, 12), now, "en-US")).toBe("3 exercises · last done 2 days ago");
    expect(schemeDetails(1, null, now, "en-US")).toBe("1 exercise");
  });

  it("names the muscle group and equipment of an exercise", () => {
    expect(exerciseDetailsText(makeExercise({ muscleGroupId: 1, equipmentId: 1 }), reference)).toBe("Chest · Barbell");
    expect(exerciseDetailsText(makeExercise({ muscleGroupId: 9, equipmentId: 2 }), reference)).toBe("Body");
  });

  it("writes the time of a suggested workout", () => {
    expect(formatWorkoutMinutes(45)).toBe("45 min");
    expect(formatWorkoutMinutes(60)).toBe("1 h");
    expect(formatWorkoutMinutes(105)).toBe("1 h 45 min");
  });
});

describe("picking exercises", () => {
  it("knows the positions of an exercise picked several times", () => {
    expect(pickedPositions(["a", "b", "a"], "a")).toEqual([1, 3]);
    expect(pickedPositions(["a"], "c")).toEqual([]);
  });

  it("removes the last time it was picked", () => {
    expect(withoutLastPick(["a", "b", "a"], "a")).toEqual(["a", "b"]);
    expect(withoutLastPick(["a"], "c")).toEqual(["a"]);
  });

  it("moves an item", () => {
    expect(moved(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moved(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  });
});

describe("isAlwaysAvailable", () => {
  it("is only the body", () => {
    expect(equipment.filter(isAlwaysAvailable).map((item) => item.name)).toEqual(["Body"]);
  });
});
