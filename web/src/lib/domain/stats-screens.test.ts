import { describe, expect, it } from "vitest";

import { makeExercise, makeWorkoutExercise, makeWorkoutWithExercises, muscleGroups, muscles } from "@/test/fixtures";
import { UnitSystem } from "@/types/models";
import { distributionPercentages } from "./muscle-distribution";
import { makeMuscleMask, maskAlpha, maskSize } from "./muscle-mask";
import {
  exerciseStatsLines,
  exercisesWithStats,
  interestingFactShareText,
  pastWorkoutShareText,
  pastWorkoutSummaryLines,
} from "./stats-screens";

const metric = { weightUnit: UnitSystem.metric, distanceUnit: UnitSystem.metric };

const bench = makeExercise({
  id: "bench",
  name: "Bench Press",
  primaryMuscleIds: [1],
  secondaryMuscleIds: [2, 3],
  muscleGroupId: 1,
});
const lunge = makeExercise({ id: "lunge", name: "Lunge", primaryMuscleIds: [4], muscleGroupId: 2 });
const rowing = makeExercise({
  id: "rowing",
  name: "Rowing",
  tracksReps: false,
  tracksWeights: false,
  tracksTime: true,
  tracksIntensity: true,
  tracksDistance: true,
});

describe("distributionPercentages (DistributionByMuscleView.getPercentages)", () => {
  const workouts = [
    makeWorkoutWithExercises({}, [[bench, { reps: [10, 8, 6], weights: [50, 50, 50] }]]),
    makeWorkoutWithExercises({}, [
      [bench, { reps: [5, 5], weights: [60, 60] }],
      [lunge, { unilateral: true, reps: [10, 10, 8, 8], weights: [0, 0, 0, 0] }],
    ]),
  ];
  // Muscles: Chest, Triceps, Front Deltoid, Quads. Groups: Chest, Legs.

  it("counts the sets of primary muscles fully and of secondary muscles a third", () => {
    // Chest 3 + 2 = 5, Triceps and Front Deltoid 0.33 * 5, Quads 2 (unilateral sets)
    const percentages = distributionPercentages(workouts, muscles, muscleGroups, "Sets", "Muscle");
    expect(percentages.map((value) => Number(value.toFixed(6)))).toEqual([100, 33, 33, 40]);
  });

  it("counts the reps", () => {
    // Chest 34, Triceps 0.33 * 34, Quads 36
    const [chest, triceps, frontDeltoid, quads] = distributionPercentages(
      workouts,
      muscles,
      muscleGroups,
      "Reps",
      "Muscle",
    );
    expect(chest).toBeCloseTo((34 / 36) * 100);
    expect(triceps).toBeCloseTo(((0.33 * 34) / 36) * 100);
    expect(frontDeltoid).toBeCloseTo(triceps);
    expect(quads).toBe(100);
  });

  it("counts the workouts of the primary muscles only", () => {
    expect(distributionPercentages(workouts, muscles, muscleGroups, "Workouts", "Muscle")).toEqual([100, 0, 0, 50]);
  });

  it("counts a unilateral set once for a muscle group, like for a muscle", () => {
    // Chest 3 + 2, Legs 2 unilateral sets (4 entries)
    expect(distributionPercentages(workouts, muscles, muscleGroups, "Sets", "Muscle Group")).toEqual([100, 40]);
    expect(distributionPercentages(workouts, muscles, muscleGroups, "Workouts", "Muscle Group")).toEqual([100, 50]);
    expect(distributionPercentages(workouts, muscles, muscleGroups, "Reps", "Muscle Group")).toEqual([
      (34 / 36) * 100,
      100,
    ]);
  });

  it("is 0 for everything without workouts", () => {
    expect(distributionPercentages([], muscles, muscleGroups, "Sets", "Muscle")).toEqual([0, 0, 0, 0]);
  });
});

describe("past workout (PastWorkoutDetailView)", () => {
  const workout = makeWorkoutWithExercises({ name: "Push", date: new Date(2026, 9, 12, 18, 0), duration: 75 }, [
    [bench, { reps: [10, 8], weights: [60, 62.5] }],
    [rowing, { time: [480, 0], intensity: [7.5, 0], distance: [2000, 1500] }],
  ]);

  it("shows the lines of the metrics tracked in the workout", () => {
    expect(pastWorkoutSummaryLines(workout, metric)).toEqual([
      { title: "Date", value: "12.10.26" },
      { title: "Time Trained", value: "1 h 15 min" },
      { title: "Sets", value: "4" },
      { title: "Reps", value: "18" },
      { title: "Volume", value: "1.1k kg" },
      { title: "Exercise Time", value: "8 min" },
      { title: "Avg Intensity", value: "lvl 7.5" },
      { title: "Distance", value: "3.5 km" },
    ]);
    const onlyRowing = makeWorkoutWithExercises({ duration: 20 }, [
      [rowing, { time: [0], intensity: [0], distance: [0] }],
    ]);
    expect(
      pastWorkoutSummaryLines(onlyRowing, metric)
        .map((line) => `${line.title}: ${line.value}`)
        .slice(2),
    ).toEqual(["Sets: 1", "Exercise Time: 0 s", "Avg Intensity: –", "Distance: 0 m"]);
  });

  it("shares the workout with all its sets", () => {
    const anHourLater = new Date(workout.date.getTime() + 60 * 60 * 1000);
    expect(pastWorkoutShareText(workout, metric, anHourLater)).toBe(
      "I just completed a workout and tracked it with Gym 2.0! Check it out:\n\nPush\n" +
        "Date: 12.10.26\nTime Trained: 1 h 15 min\nSets: 4\nReps: 18\nVolume: 1.1k kg\nExercise Time: 8 min\n" +
        "Avg Intensity: lvl 7.5\nDistance: 3.5 km\n\n" +
        "💪Bench Press\n10x, 60.0 kg\n8x, 62.5 kg\n\n" +
        "💪Rowing\n8:00, lvl 7.5, 2 km\n0:00, lvl 0, 1.5 km\n\n",
    );
  });

  it("doesn't say just completed for a workout older than a day", () => {
    const twoDaysLater = new Date(workout.date.getTime() + 2 * 24 * 60 * 60 * 1000);
    expect(pastWorkoutShareText(workout, metric, twoDaysLater)).toMatch(/^I tracked a workout with Gym 2\.0! Check it out:\n\nPush\n/);
  });

  it("shares a fact", () => {
    expect(interestingFactShareText("You trained 3 h.")).toBe(
      "Look at this cool fact the Gym 2.0 app told me about my workouts: \n \nYou trained 3 h.",
    );
  });
});

describe("exercise stats (ExercisesStatsView, ExercisesStatsDetailView)", () => {
  it("lists the exercises of the workouts by name like Swift's <, or by the search incl. aliases", () => {
    const squat = makeExercise({ id: "squat", name: "Squat" });
    const arnold = makeExercise({ id: "arnold", name: "arnold press" });
    const shoulder = makeExercise({ id: "shoulder", name: "Barbell Shoulder Press", aliases: ["Military Press"] });
    const workouts = [
      makeWorkoutWithExercises({}, [
        [squat, {}],
        [arnold, {}],
      ]),
      makeWorkoutWithExercises({}, [
        [bench, {}],
        [squat, {}],
        [shoulder, {}],
      ]),
    ];
    expect(exercisesWithStats(workouts, "").map((e) => e.name)).toEqual([
      "Barbell Shoulder Press",
      "Bench Press",
      "Squat",
      "arnold press",
    ]);
    expect(exercisesWithStats(workouts, "military").map((e) => e.id)).toEqual(["shoulder"]);
    expect(exercisesWithStats(workouts, "press").map((e) => e.id)).toEqual(["arnold", "bench", "shoulder"]);
  });

  it("sums up the values the exercise tracks", () => {
    const history = [
      makeWorkoutExercise({ workoutId: "a", exerciseId: "bench", reps: [10, 8], weights: [60, 62.5] }),
      makeWorkoutExercise({ workoutId: "b", exerciseId: "bench", reps: [12], weights: [62.5] }),
    ];
    expect(exerciseStatsLines(bench, history, metric)).toEqual([
      { title: "Workouts", value: "2" },
      { title: "Sets", value: "3" },
      { title: "Total Reps", value: "30" },
      { title: "Avg Reps per Set", value: "10" },
      { title: "Volume", value: "1.9k kg" },
      { title: "Personal Record", value: "12x 62.5 kg" },
    ]);
    expect(exerciseStatsLines(bench, [], metric).map((line) => line.value)).toEqual(["0", "0", "0", "–", "0 kg", "–"]);

    const rows = [
      makeWorkoutExercise({
        workoutId: "a",
        reps: null,
        weights: null,
        time: [480, 0],
        intensity: [7.5, 0],
        distance: [2000, 1500],
      }),
    ];
    expect(exerciseStatsLines(rowing, rows, metric)).toEqual([
      { title: "Workouts", value: "1" },
      { title: "Sets", value: "2" },
      { title: "Total Time", value: "8 min" },
      { title: "Avg Time per Set", value: "8 min" },
      { title: "Longest Set", value: "8 min" },
      { title: "Avg Intensity", value: "lvl 7.5" },
      { title: "Highest Intensity", value: "lvl 7.5" },
      { title: "Total Distance", value: "3.5 km" },
      { title: "Avg Distance per Set", value: "1.75 km" },
      { title: "Longest Set", value: "2 km" },
    ]);
  });
});

describe("muscle masks (HighlightedBodyView)", () => {
  it("keeps the colored pixels only", () => {
    expect(maskAlpha(255, 255, 255)).toBe(0);
    expect(maskAlpha(0, 0, 0)).toBe(0);
    expect(maskAlpha(140, 120, 130)).toBe(0);
    expect(maskAlpha(255, 0, 0)).toBe(255);
    expect(maskAlpha(255, 128, 0)).toBe(Math.trunc(((255 - 24) * 255) / 231));
    expect(maskAlpha(124, 100, 100)).toBe(0);
    expect(maskAlpha(125, 100, 100)).toBe(1);
  });

  it("makes white pixels with the opacity, transparent pixels count as black", () => {
    const pixels = new Uint8ClampedArray([255, 0, 0, 255, 255, 255, 255, 255, 255, 0, 0, 0]);
    makeMuscleMask(pixels);
    expect(Array.from(pixels)).toEqual([255, 255, 255, 255, 255, 255, 255, 0, 255, 255, 255, 0]);
  });

  it("scales down to at most 800 pixels", () => {
    expect(maskSize(1051, 1261)).toEqual({ width: 667, height: 800 });
    expect(maskSize(400, 300)).toEqual({ width: 400, height: 300 });
  });
});
