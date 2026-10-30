import { describe, expect, it } from "vitest";

import { makeExercise, reference } from "@/test/fixtures";
import {
  exerciseCanChangeTrackedMetrics,
  exerciseCanEdit,
  exerciseEquipment,
  exerciseMuscleGroup,
  exercisePrimaryMuscles,
  exerciseSearchNames,
  exerciseSecondaryMuscles,
  exerciseTrackedMetrics,
  exerciseUsesBodyweight,
  musclesWithIds,
} from "./exercise";

describe("reference data of an exercise", () => {
  it("resolves the muscle group, the equipment and the muscles by server id", () => {
    const exercise = makeExercise({ muscleGroupId: 2, equipmentId: 3, primaryMuscleIds: [4, 99, 1], secondaryMuscleIds: [2] });
    expect(exerciseMuscleGroup(exercise, reference)?.name).toBe("Legs");
    expect(exerciseEquipment(exercise, reference)?.name).toBe("Pull Up Bar");
    // in the order of the ids, unknown ones left out
    expect(exercisePrimaryMuscles(exercise, reference).map((muscle) => muscle.name)).toEqual(["Quads", "Chest"]);
    expect(exerciseSecondaryMuscles(exercise, reference).map((muscle) => muscle.name)).toEqual(["Triceps"]);
    expect(musclesWithIds([], reference)).toEqual([]);
  });

  it("is null for unknown ids, e.g. before the first sync", () => {
    const exercise = makeExercise({ muscleGroupId: 99, equipmentId: 99 });
    expect(exerciseMuscleGroup(exercise, reference)).toBeNull();
    expect(exerciseEquipment(exercise, reference)).toBeNull();
    expect(exerciseUsesBodyweight(exercise, reference)).toBe(false);
  });

  it("uses the bodyweight for body and pull up bar exercises", () => {
    expect(exerciseUsesBodyweight(makeExercise({ equipmentId: 1 }), reference)).toBe(false);
    expect(exerciseUsesBodyweight(makeExercise({ equipmentId: 2 }), reference)).toBe(true);
    expect(exerciseUsesBodyweight(makeExercise({ equipmentId: 3 }), reference)).toBe(true);
  });
});

describe("exercise rules", () => {
  it("searches the name and then the aliases", () => {
    expect(exerciseSearchNames({ name: "Cable Fly", aliases: ["Fly", "Pec Fly"] })).toEqual(["Cable Fly", "Fly", "Pec Fly"]);
  });

  it("can't edit verified exercises, nor change the metrics of used ones", () => {
    expect(exerciseCanEdit(makeExercise({ verified: true }))).toBe(false);
    expect(exerciseCanEdit(makeExercise())).toBe(true);
    expect(exerciseCanChangeTrackedMetrics(makeExercise(), false)).toBe(true);
    expect(exerciseCanChangeTrackedMetrics(makeExercise(), true)).toBe(false);
    expect(exerciseCanChangeTrackedMetrics(makeExercise({ verified: true }), false)).toBe(false);
  });

  it("lists the tracked metrics in the order they are shown", () => {
    expect(exerciseTrackedMetrics(makeExercise())).toEqual(["reps", "weights"]);
    expect(
      exerciseTrackedMetrics(makeExercise({ tracksReps: false, tracksWeights: false, tracksDistance: true, tracksTime: true, tracksIntensity: true })),
    ).toEqual(["time", "intensity", "distance"]);
  });
});
