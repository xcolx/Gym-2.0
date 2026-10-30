"use client";

// Port of ios/Gym 2.0/Features/Workout/Sets/EditWorkoutExerciseView.swift

import { HighlightedBody } from "@/components/ui/HighlightedBody";
import { exercisePrimaryMuscles, exerciseSecondaryMuscles } from "@/lib/domain/exercise";
import { trackedMetrics } from "@/lib/domain/workout-exercise";
import { useReferenceData } from "@/lib/repo/hooks";
import type { LocalId, WorkoutExerciseWithExercise } from "@/types/models";
import { Switch } from "@/components/ui/controls";
import { storedSetActions, type SetActions } from "./set-actions";
import { SetTable } from "./SetTable";

const smallPill =
  "min-h-11 rounded-[25px] bg-my-black px-[15px] py-[5px] text-headline font-semibold text-my-white active:opacity-60";

export function EditWorkoutExercise({
  workoutExercise,
  stopwatchWorkoutId,
  actions = storedSetActions,
}: {
  workoutExercise: WorkoutExerciseWithExercise;
  /** Set in the performing workout, see SetTable */
  stopwatchWorkoutId?: LocalId;
  /** Where the changes go, stored right away by default */
  actions?: SetActions;
}) {
  const reference = useReferenceData();
  const exercise = workoutExercise.exercise;
  // With more than two metrics the set table needs the full width, the buttons are shown above it
  const compact = trackedMetrics(workoutExercise).length > 2;

  const addButton = (
    <button type="button" className={smallPill} onClick={() => actions.addSet(workoutExercise.id)}>
      add set
    </button>
  );
  const removeButton = (
    <button type="button" className={smallPill} onClick={() => actions.removeLastSet(workoutExercise.id)}>
      remove set
    </button>
  );
  const unilateralToggle = (
    <label className="flex items-center gap-2">
      <span>unilateral</span>
      <Switch
        label="unilateral"
        checked={workoutExercise.unilateral}
        onChange={(unilateral) => actions.setUnilateral(workoutExercise.id, unilateral)}
      />
    </label>
  );
  const table = <SetTable workoutExercise={workoutExercise} stopwatchWorkoutId={stopwatchWorkoutId} actions={actions} />;

  if (compact) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 px-2.5">
          {addButton}
          {removeButton}
          <span className="flex-1" />
          {unilateralToggle}
        </div>
        <div className="px-2.5">{table}</div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 px-2.5">
      <div className="flex w-[36%] max-w-[180px] shrink-0 flex-col items-center gap-2">
        {addButton}
        {removeButton}
        {unilateralToggle}
        <HighlightedBody
          className="w-full"
          primaryMuscles={exercise && reference ? exercisePrimaryMuscles(exercise, reference) : []}
          secondaryMuscles={exercise && reference ? exerciseSecondaryMuscles(exercise, reference) : []}
        />
      </div>
      {table}
    </div>
  );
}
