import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeWorkoutExercise } from "@/test/fixtures";
import { UnitSystem } from "@/types/models";
import type { SetActions } from "./set-actions";
import { SetTable } from "./SetTable";

const settings = vi.hoisted(() => ({ current: { weightUnit: 0, distanceUnit: 0 } }));
vi.mock("@/lib/repo/hooks", () => ({ useUserSettings: () => settings.current }));

function fakeActions(): SetActions {
  return { addSet: vi.fn(), removeLastSet: vi.fn(), setValue: vi.fn(), setUnilateral: vi.fn() };
}

let actions: SetActions;

beforeEach(() => {
  settings.current = { weightUnit: UnitSystem.metric, distanceUnit: UnitSystem.metric };
  actions = fakeActions();
});

describe("SetTable", () => {
  it("shows a row per set with the stored values", () => {
    const workoutExercise = makeWorkoutExercise({ reps: [10, 8], weights: [60, 62.5] });

    render(<SetTable workoutExercise={workoutExercise} actions={actions} />);

    expect(screen.getByText("Reps")).toBeTruthy();
    expect(screen.getByText("kg")).toBeTruthy();
    expect((screen.getByLabelText("Reps of set 1") as HTMLInputElement).value).toBe("10");
    expect((screen.getByLabelText("kg of set 2") as HTMLInputElement).value).toBe("62.5");
  });

  it("stores valid values in kilograms and reverts invalid ones", async () => {
    settings.current = { weightUnit: UnitSystem.imperial, distanceUnit: UnitSystem.imperial };
    const workoutExercise = makeWorkoutExercise({ reps: [10], weights: [0] });
    render(<SetTable workoutExercise={workoutExercise} actions={actions} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("lbs of set 1"), "100");
    const [, metric, entryIndex, kilograms] = vi.mocked(actions.setValue).mock.lastCall!;
    expect([metric, entryIndex]).toEqual(["weights", 0]);
    expect(kilograms).toBeCloseTo(45.359237, 6);

    // Reps are whole numbers, the point is refused and the field keeps the stored value
    const reps = screen.getByLabelText("Reps of set 1") as HTMLInputElement;
    await user.click(reps);
    await user.type(reps, ".");
    expect(reps.value).toBe("10");
    expect(vi.mocked(actions.setValue).mock.calls.every(([, field]) => field !== "reps")).toBe(true);
  });

  it("formats the value once the field is left", async () => {
    const workoutExercise = makeWorkoutExercise({ reps: null, weights: null, time: [0] });
    const { rerender } = render(<SetTable workoutExercise={workoutExercise} actions={actions} />);
    const user = userEvent.setup();
    const time = screen.getByLabelText("Time of set 1") as HTMLInputElement;

    await user.type(time, "90");
    expect(actions.setValue).toHaveBeenLastCalledWith(workoutExercise.id, "time", 0, 90);
    expect(time.value).toBe("90");

    rerender(<SetTable workoutExercise={{ ...workoutExercise, time: [90] }} actions={actions} />);
    await user.keyboard("{Enter}");
    expect(time.value).toBe("1:30");
  });

  it("labels the sides of unilateral sets", () => {
    const workoutExercise = makeWorkoutExercise({ unilateral: true, reps: [10, 9], weights: [20, 20] });

    render(<SetTable workoutExercise={workoutExercise} actions={actions} />);

    // Testing Library collapses the two spaces of "1  R"
    expect(screen.getByLabelText("Reps of set 1 R")).toBeTruthy();
    expect(screen.getByLabelText("Reps of set L")).toBeTruthy();
  });

  it("changes the sign of the intensity with the accessory button", async () => {
    const workoutExercise = makeWorkoutExercise({ reps: null, weights: null, intensity: [2.5] });
    render(<SetTable workoutExercise={workoutExercise} actions={actions} />);
    const user = userEvent.setup();

    await user.click(screen.getByLabelText("Level of set 1"));
    await user.click(screen.getByRole("button", { name: "Change the sign" }));

    expect(actions.setValue).toHaveBeenLastCalledWith(workoutExercise.id, "intensity", 0, -2.5);
  });
});
