import "fake-indexeddb/auto";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deleteUserDb, openUserDb, type GymDB } from "@/lib/db";
import { createExercise, startWorkout, type ExerciseInput } from "@/lib/repo";
import { useWorkout } from "@/lib/repo/hooks";
import type { LocalId } from "@/types/models";
import { EditPerformingWorkout } from "./EditPerformingWorkout";

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

const exerciseInput = (name: string): ExerciseInput => ({
  name,
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

function EditSheet({ workoutId }: { workoutId: LocalId }) {
  const workout = useWorkout(workoutId);
  return workout ? <EditPerformingWorkout open workout={workout} onClose={() => {}} /> : null;
}

const exerciseNames = async (workoutId: LocalId) => {
  const rows = await db.workoutExercises.where("workoutId").equals(workoutId).sortBy("index");
  return Promise.all(rows.map(async (row) => (await db.exercises.get(row.exerciseId!))?.name));
};

describe("EditPerformingWorkout", () => {
  it("renames the workout and removes an exercise", async () => {
    const bench = await createExercise(exerciseInput("Bench Press"));
    const fly = await createExercise(exerciseInput("Cable Fly"));
    const workout = await startWorkout("Push", [bench.id, fly.id]);
    render(<EditSheet workoutId={workout.id} />);
    const user = userEvent.setup();

    const name = await screen.findByLabelText("Name of the workout");
    await user.clear(name);
    await user.type(name, "Chest Day");
    await waitFor(async () => expect((await db.workouts.get(workout.id))?.name).toBe("Chest Day"));

    // the keyboard on the handle, like swiping the row to the left
    screen.getByRole("button", { name: "Move Bench Press" }).focus();
    await user.keyboard("{Delete}");
    await waitFor(async () => expect(await exerciseNames(workout.id)).toEqual(["Cable Fly"]));
  });

  it("keeps the last name while the field is empty", async () => {
    const bench = await createExercise(exerciseInput("Bench Press"));
    const workout = await startWorkout("Push", [bench.id]);
    render(<EditSheet workoutId={workout.id} />);
    const user = userEvent.setup();

    await user.clear(await screen.findByLabelText("Name of the workout"));

    expect((await db.workouts.get(workout.id))?.name).toBe("Push");
  });

  it("adds an exercise from the exercise list", async () => {
    const bench = await createExercise(exerciseInput("Bench Press"));
    await createExercise(exerciseInput("Squat"));
    const workout = await startWorkout("Push", [bench.id]);
    render(<EditSheet workoutId={workout.id} />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Add exercises" }));
    await user.type(screen.getByPlaceholderText("Search"), "squ");
    expect(screen.queryByRole("button", { name: "Add Bench Press" })).toBeNull();
    // picked in the list, added with the button at the bottom
    await user.click(screen.getByRole("button", { name: "Add Squat" }));
    await user.click(screen.getByRole("button", { name: "Add 1 exercise" }));

    await waitFor(async () => expect(await exerciseNames(workout.id)).toEqual(["Bench Press", "Squat"]));
  });
});
