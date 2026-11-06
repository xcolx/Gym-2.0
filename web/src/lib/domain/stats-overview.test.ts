import { describe, expect, it } from "vitest";

import { makeExercise, makeWorkoutExercise, makeWorkoutWithExercises, muscles } from "@/test/fixtures";
import { UnitSystem } from "@/types/models";
import { summaryOfWorkoutExercises } from "./stats";
import {
  activityLevel,
  activityWeeks,
  chartMetrics,
  chartRangeStart,
  chartValue,
  dayKey,
  exerciseStatsRows,
  minutesSince,
  monthStartIndices,
  personalRecordSet,
  relativeDay,
  shownExerciseStatsRows,
  statsOverview,
  topMuscles,
  workoutsByMonth,
} from "./stats-overview";

const metric = { weightUnit: UnitSystem.metric, distanceUnit: UnitSystem.metric };

const bench = makeExercise({ id: "bench", name: "Bench Press", primaryMuscleIds: [1], secondaryMuscleIds: [2] });
const squat = makeExercise({ id: "squat", name: "Squat", primaryMuscleIds: [4] });

describe("statsOverview (StatsOverview.make)", () => {
  const monday = makeWorkoutWithExercises({ id: "a", date: new Date(2026, 10, 2, 8), duration: 40 }, [
    [bench, { reps: [10, 8, 8], weights: [60, 60, 60] }],
  ]);
  const mondayEvening = makeWorkoutWithExercises({ id: "b", date: new Date(2026, 10, 2, 19), duration: 30 }, [
    [squat, { reps: [5], weights: [100] }],
    [bench, { reps: [10], weights: [60] }],
  ]);

  it("adds up the minutes per day, the sets per muscle and the exercises", () => {
    const overview = statsOverview([monday, mondayEvening]);
    expect(overview.minutesByDay).toEqual(new Map([[dayKey(new Date(2026, 10, 2)), 70]]));
    expect(overview.setsByMuscleId.get(1)).toBe(4);
    expect(overview.setsByMuscleId.get(2)).toBeCloseTo(1.32);
    expect(overview.setsByMuscleId.get(4)).toBe(1);
    expect(overview.exerciseCount).toBe(2);
  });

  it("lists the most trained muscles first, without the untrained ones", () => {
    const { setsByMuscleId } = statsOverview([monday, mondayEvening]);
    expect(topMuscles(muscles, setsByMuscleId).map(({ muscle }) => muscle.name)).toEqual(["Chest", "Triceps", "Quads"]);
    expect(topMuscles(muscles, setsByMuscleId, 1).map(({ sets }) => sets)).toEqual([4]);
  });
});

describe("activity board (ActivityBoardView)", () => {
  const thursday = new Date(2026, 10, 5, 15);

  it("has a year of weeks from the first weekday, the current week last", () => {
    const weeks = activityWeeks(thursday, 1);
    expect(weeks).toHaveLength(53);
    expect(weeks.every((week) => week.length === 7 && week[0].getDay() === 1)).toBe(true);
    expect(weeks.at(-1)![0]).toEqual(new Date(2026, 10, 2));
    expect(weeks[0][0]).toEqual(new Date(2025, 10, 3));
  });

  it("names the months above the weeks that start them, not at the edges", () => {
    const months = (now: Date) => [...monthStartIndices(activityWeeks(now, 1, 6))];
    // Mondays 28 Sep, 5 Oct, ..., 2 Nov
    expect(months(thursday)).toEqual([1]);
    // Mondays 12 Oct, ..., 2 Nov, 9 Nov, 16 Nov
    expect(months(new Date(2026, 10, 19))).toEqual([3]);
    // Mondays 5 Oct, ..., 2 Nov, 9 Nov: November would be cut off
    expect(months(new Date(2026, 10, 9))).toEqual([]);
  });

  it("gets darker the longer the workouts of the day were", () => {
    expect([0, 15, 45, 75, 90].map(activityLevel)).toEqual([0, 1, 2, 3, 4]);
  });

  it("adds up the minutes from the first day of the board", () => {
    const minutes = new Map([
      [dayKey(new Date(2026, 0, 1)), 30],
      [dayKey(new Date(2026, 5, 1)), 45],
    ]);
    expect(minutesSince(minutes, new Date(2026, 2, 1))).toBe(45);
  });
});

describe("relativeDay", () => {
  const now = new Date(2026, 10, 5, 10);
  it("says today and yesterday, otherwise the date", () => {
    expect(relativeDay(new Date(2026, 10, 5, 7), now, "en-US")).toBe("today");
    expect(relativeDay(new Date(2026, 10, 4, 22), now, "en-US")).toBe("yesterday");
    expect(relativeDay(new Date(2026, 9, 12), now, "en-US")).toBe("Oct 12");
  });
});

describe("workoutsByMonth (PastWorkoutsView)", () => {
  it("groups the workouts, which are the newest first, by month", () => {
    const workouts = [new Date(2026, 10, 3), new Date(2026, 10, 1), new Date(2026, 8, 30)].map((date) => ({ date }));
    expect(workoutsByMonth(workouts).map(({ month, workouts }) => [month.getMonth(), workouts.length])).toEqual([
      [10, 2],
      [8, 1],
    ]);
  });
});

describe("exercise rows (ExercisesStatsView)", () => {
  const arnold = makeExercise({ id: "arnold", name: "arnold press" });
  const shoulder = makeExercise({ id: "shoulder", name: "Barbell Shoulder Press", aliases: ["Military Press"] });
  const workouts = [
    makeWorkoutWithExercises({ id: "old", date: new Date(2026, 9, 1) }, [
      [squat, {}],
      [arnold, {}],
    ]),
    makeWorkoutWithExercises({ id: "new", date: new Date(2026, 10, 1) }, [
      [bench, {}],
      [squat, {}],
      [shoulder, {}],
    ]),
  ];
  const rows = exerciseStatsRows(workouts);

  it("counts the workouts of every exercise and when it was last done", () => {
    const squatRow = rows.find((row) => row.exercise.id === "squat")!;
    expect(squatRow.workoutCount).toBe(2);
    expect(squatRow.lastDate).toEqual(new Date(2026, 10, 1));
  });

  it("sorts by name like Swift's <, by how often or when they were last done", () => {
    const names = (sort: Parameters<typeof shownExerciseStatsRows>[1]) =>
      shownExerciseStatsRows(rows, sort, "").map((row) => row.exercise.id);
    expect(names("Name")).toEqual(["shoulder", "bench", "squat", "arnold"]);
    expect(names("Most done")).toEqual(["squat", "shoulder", "bench", "arnold"]);
    expect(names("Last done")[3]).toBe("arnold");
  });

  it("searches the names and the aliases, best match first", () => {
    expect(shownExerciseStatsRows(rows, "Name", "military").map((row) => row.exercise.id)).toEqual(["shoulder"]);
    expect(shownExerciseStatsRows(rows, "Name", "press").map((row) => row.exercise.id)).toEqual(["arnold", "bench", "shoulder"]);
  });
});

describe("progress chart (ExerciseChartMetric)", () => {
  const rowing = makeExercise({
    tracksReps: false,
    tracksWeights: false,
    tracksTime: true,
    tracksIntensity: true,
    tracksDistance: true,
  });

  it("offers the metrics the exercise tracks", () => {
    expect(chartMetrics(bench)).toEqual(["heaviest", "volume", "reps"]);
    expect(chartMetrics(rowing)).toEqual(["time", "intensity", "distance"]);
  });

  it("takes one value per time the exercise was done, in the units of the user", () => {
    const sets = makeWorkoutExercise({ reps: [10, 8], weights: [60, 100], time: [90, 30], intensity: [0, 6], distance: [1000, 500] });
    expect(chartValue(sets, "heaviest", metric)).toBe(100);
    expect(chartValue(sets, "heaviest", { ...metric, weightUnit: UnitSystem.imperial })).toBeCloseTo(220.46, 1);
    expect(chartValue(sets, "volume", metric)).toBe(1400);
    expect(chartValue(sets, "reps", metric)).toBe(18);
    expect(chartValue(sets, "time", metric)).toBe(2);
    expect(chartValue(sets, "intensity", metric)).toBe(6);
    expect(chartValue(sets, "distance", metric)).toBe(1500);
    expect(chartValue(makeWorkoutExercise({ reps: [0], weights: [0] }), "heaviest", metric)).toBeNull();
  });

  it("starts the periods months or a year back", () => {
    const now = new Date(2026, 10, 5);
    expect(chartRangeStart("3M", now)).toEqual(new Date(2026, 7, 5));
    expect(chartRangeStart("1Y", now)).toEqual(new Date(2025, 10, 5));
    expect(chartRangeStart("All", now)).toBeNull();
  });
});

describe("personalRecordSet (ExerciseHistoryCard.recordSet)", () => {
  it("finds the first time the record was done", () => {
    const history = [
      makeWorkoutExercise({ id: "newest", reps: [12], weights: [62.5] }),
      makeWorkoutExercise({ id: "older", reps: [8, 12], weights: [60, 62.5] }),
      makeWorkoutExercise({ id: "oldest", reps: [10], weights: [60] }),
    ];
    expect(personalRecordSet(bench, history, summaryOfWorkoutExercises(history))).toEqual({
      workoutExerciseId: "older",
      index: 1,
    });
    expect(personalRecordSet(bench, [], summaryOfWorkoutExercises([]))).toBeNull();
  });
});
