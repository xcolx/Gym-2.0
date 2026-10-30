import "fake-indexeddb/auto";

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deleteUserDb, openUserDb, type GymDB } from "@/lib/db";
import { createExercise, finishWorkout, setSetValue, startWorkout } from "@/lib/repo";
import { useWorkout } from "@/lib/repo/hooks";
import type { LocalId } from "@/types/models";
import { PerformingExercise } from "./PerformingExercise";

// Stores every change in IndexedDB like the workout page, which shows one exercise of the workout in progress
const USER_ID = 42;
let db: GymDB;

beforeEach(async () => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  db = (await openUserDb(USER_ID))!;
});

afterEach(async () => {
  await deleteUserDb(USER_ID);
  vi.restoreAllMocks();
});

function WorkoutPage({ workoutId, onShowExercise = () => {} }: { workoutId: LocalId; onShowExercise?: (id: LocalId) => void }) {
  const workout = useWorkout(workoutId);
  if (!workout) return null;
  const [first] = workout.workoutExercises;
  return <PerformingExercise workoutExercise={first} workoutId={workout.id} onShowExercise={onShowExercise} />;
}

async function benchPress() {
  return createExercise({
    name: "Bench Press",
    aliases: [],
    exerciseDescription: null,
    muscleGroupId: 1,
    equipmentId: 1,
    primaryMuscleIds: [1],
    secondaryMuscleIds: [],
    tracksReps: true,
    tracksWeights: true,
    tracksTime: false,
    tracksIntensity: false,
    tracksDistance: false,
  });
}

const firstWorkoutExercise = async (workoutId: LocalId) =>
  (await db.workoutExercises.where("workoutId").equals(workoutId).first())!;

describe("PerformingExercise", () => {
  it("stores the entered sets right away", async () => {
    const exercise = await benchPress();
    const workout = await startWorkout("Push", [exercise.id]);
    render(<WorkoutPage workoutId={workout.id} />);
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText("Reps of set 1"), "10");
    await user.type(screen.getByLabelText("kg of set 1"), "60");
    await user.click(screen.getByRole("button", { name: "add set" }));
    await user.type(await screen.findByLabelText("Reps of set 2"), "8");

    await waitFor(async () => {
      const stored = await firstWorkoutExercise(workout.id);
      expect(stored.reps).toEqual([10, 8]);
      expect(stored.weights?.[0]).toBe(60);
    });

    await user.click(screen.getByRole("button", { name: "remove set" }));
    await waitFor(async () => expect((await firstWorkoutExercise(workout.id)).reps).toEqual([10]));
    await waitFor(() => expect(screen.queryByLabelText("Reps of set 2")).toBeNull());
  });

  it("shows the earlier workouts with the exercise", async () => {
    const exercise = await benchPress();
    const earlier = await startWorkout("Monday Push", [exercise.id]);
    const earlierExercise = await firstWorkoutExercise(earlier.id);
    await setSetValue(earlierExercise.id, "reps", 0, 12);
    await setSetValue(earlierExercise.id, "weights", 0, 50);
    await finishWorkout(earlier.id);
    const workout = await startWorkout("Push", [exercise.id]);

    render(<WorkoutPage workoutId={workout.id} />);

    const entry = (await screen.findByText("Monday Push")).closest("li")!;
    expect(within(entry).getByText(/12/)).toBeTruthy();
    expect(screen.queryByText(/You have never done this exercise/)).toBeNull();
  });

  it("says so when the exercise was never done and opens the exercise", async () => {
    const exercise = await benchPress();
    const workout = await startWorkout("Push", [exercise.id]);
    const onShowExercise = vi.fn();
    render(<WorkoutPage workoutId={workout.id} onShowExercise={onShowExercise} />);

    expect(await screen.findByText(/You have never done this exercise/)).toBeTruthy();
    await userEvent.setup().click(screen.getByRole("button", { name: "Bench Press" }));
    expect(onShowExercise).toHaveBeenCalledWith(exercise.id);
  });
});
