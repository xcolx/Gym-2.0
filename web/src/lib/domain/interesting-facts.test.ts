import { describe, expect, it } from "vitest";

import { equipment, makeExercise, makeWorkoutWithExercises, muscleGroups } from "@/test/fixtures";
import { UnitSystem } from "@/types/models";
import { formatCount, formatCountOf, interestingFacts } from "./interesting-facts";

describe("interestingFacts", () => {
  const squat = makeExercise({ name: "Squat", muscleGroupId: 2, equipmentId: 1 });
  const pushUp = makeExercise({ name: "Push Up", muscleGroupId: 1, equipmentId: 2 });

  const workouts = [
    // Monday 6:30
    makeWorkoutWithExercises({ date: new Date(2026, 9, 5, 6, 30), duration: 200 }, [
      [squat, { reps: [10, 10], weights: [100, 100] }],
      [pushUp, { reps: [20], weights: [0] }],
    ]),
    // Monday 18:00
    makeWorkoutWithExercises({ date: new Date(2026, 9, 12, 18, 0), duration: 40 }, [[pushUp, { reps: [15], weights: [0] }]]),
  ];

  const facts = interestingFacts({
    workouts,
    equipment,
    muscleGroups,
    memberSince: new Date(2026, 8, 1),
    weightUnit: UnitSystem.metric,
    distanceUnit: UnitSystem.metric,
    now: new Date(2026, 9, 15),
    weekStartsOn: 1,
    locale: "en-US",
  });
  const fact = (title: string) => facts.find((f) => f.title === title)?.text;

  it("builds the facts the data allows", () => {
    expect(facts.map((f) => f.title)).toEqual([
      "Let's watch Tik Tok",
      "Stay in Bed",
      "Move your body",
      "Strong Legs",
      "Heavy Lifter",
      "Movie Night",
      "Favorite Day",
      "Early Bird",
      "Room to Grow",
    ]);
  });

  it("compares with the reference values", () => {
    expect(fact("Let's watch Tik Tok")).toContain("4 h 0 min");
    expect(fact("Let's watch Tik Tok")).toContain("about 337 TikTok videos");
    expect(fact("Move your body")).toContain("35 times");
    expect(fact("Strong Legs")).toContain("2.0k kg");
    expect(fact("Strong Legs")).toContain("0.3 elephants");
    expect(fact("Movie Night")).toContain("even longer than Titanic");
    expect(fact("Favorite Day")).toContain("Monday seems to be your favorite day");
    expect(fact("Favorite Day")).toContain("2 of your 2 workouts (100%)");
  });

  it("leaves out the facts without data and encourages to track it", () => {
    expect(fact("Marathon")).toBeUndefined();
    const empty = interestingFacts({
      workouts: [],
      equipment,
      muscleGroups,
      memberSince: null,
      weightUnit: UnitSystem.metric,
      distanceUnit: UnitSystem.metric,
      locale: "en-US",
    });
    expect(empty.map((f) => f.title)).toEqual(["Let's watch Tik Tok", "Stay in Bed", "Move your body", "Strong Legs"]);
    expect(empty[2].text).toContain("You haven't moved your own bodyweight yet");
  });

  it("formats counts", () => {
    expect(formatCount(0.44)).toBe("0.4");
    expect(formatCount(2)).toBe("2");
    expect(formatCount(1234.4, "en-US")).toBe("1,234");
    expect(formatCount(Infinity)).toBe("0");
    expect(formatCountOf(1, "elephant", "elephants")).toBe("1 elephant");
    expect(formatCountOf(2.5, "elephant", "elephants")).toBe("2.5 elephants");
  });
});
