"use client";

// Port of ios/Gym 2.0/Features/Workout/Sets/EditWorkoutExerciseView.swift

import { Minus, Plus } from "lucide-react";

import { canRemoveSet } from "@/lib/domain/active-workout";
import type { LocalId, WorkoutExerciseWithExercise } from "@/types/models";
import { Switch } from "@/components/ui/controls";
import { storedSetActions, type SetActions } from "./set-actions";
import { SetTable } from "./SetTable";

/** The set table of an exercise of a workout, with the buttons to add and remove a set and the unilateral switch below */
export function EditWorkoutExercise({
  workoutExercise,
  stopwatchWorkoutId,
  limitsRows = true,
  actions = storedSetActions,
}: {
  workoutExercise: WorkoutExerciseWithExercise;
  /** Set in the performing workout, see SetTable */
  stopwatchWorkoutId?: LocalId;
  /** See SetTable */
  limitsRows?: boolean;
  /** Where the changes go, stored right away by default */
  actions?: SetActions;
}) {
  const removable = canRemoveSet(workoutExercise);

  return (
    <div className="flex flex-col gap-3.5">
      <SetTable workoutExercise={workoutExercise} stopwatchWorkoutId={stopwatchWorkoutId} limitsRows={limitsRows} actions={actions} />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => actions.addSet(workoutExercise.id)}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-app/15 px-3 text-subheadline font-semibold text-app active:opacity-60"
        >
          <Plus size={16} strokeWidth={2.75} aria-hidden />
          Add set
        </button>
        {/* only the icon, the row is too narrow for the switch and two labels */}
        <button
          type="button"
          aria-label="Remove last set"
          disabled={!removable}
          onClick={() => actions.removeLastSet(workoutExercise.id)}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-field/40 active:opacity-60 disabled:text-secondary-label disabled:active:opacity-100"
        >
          <Minus size={16} strokeWidth={2.75} aria-hidden />
        </button>

        <span className="flex-1" />

        <span className="flex shrink-0 items-center gap-2 text-subheadline text-secondary-label">
          <span aria-hidden>Unilateral</span>
          <Switch
            label="Unilateral"
            checked={workoutExercise.unilateral}
            onChange={(unilateral) => actions.setUnilateral(workoutExercise.id, unilateral)}
          />
        </span>
      </div>
    </div>
  );
}
