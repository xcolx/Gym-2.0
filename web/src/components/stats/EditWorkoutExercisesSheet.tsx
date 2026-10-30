"use client";

import { CirclePlus } from "lucide-react";
import { useState } from "react";

import { ReorderableRows } from "@/components/workout/EditWorkout";
import { ExercisesSheet } from "@/components/workout/ExercisesSheet";
import { prefixCharacters } from "@/lib/domain/format";
import { MAX_WORKOUT_NAME_LENGTH } from "@/lib/domain/workout";
import type { Exercise, WorkoutWithExercises } from "@/types/models";
import { Sheet, SheetButton } from "@/components/ui/overlay";

/** The changes of the sheet, made to the draft of the edited workout */
export interface WorkoutExercisesEdits {
  rename(name: string): void;
  add(exercise: Exercise): void;
  /** By the position in the sorted list */
  remove(index: number): void;
  move(from: number, to: number): void;
}

/**
 * Port of EditPerformingWorkoutView.swift as the sheet of EditPastWorkoutView: the name, and the exercises in edit
 * mode (delete, move) with the plus button to add exercises. It changes the draft of the edit page, which is only
 * stored with its "Save".
 */
export function EditWorkoutExercisesSheet({
  open,
  onClose,
  workout,
  edits,
}: {
  open: boolean;
  onClose: () => void;
  workout: WorkoutWithExercises;
  edits: WorkoutExercisesEdits;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      label="Edit Exercises"
      // iOS closes it by swiping down
      trailing={
        <SheetButton bold onClick={onClose}>
          Done
        </SheetButton>
      }
    >
      {open && <EditExercises workout={workout} edits={edits} />}
    </Sheet>
  );
}

function EditExercises({ workout, edits }: { workout: WorkoutWithExercises; edits: WorkoutExercisesEdits }) {
  const [showExercises, setShowExercises] = useState(false);

  return (
    <div className="flex flex-col">
      <div className="flex items-center">
        <input
          value={workout.name}
          onChange={(event) => edits.rename(prefixCharacters(event.target.value, MAX_WORKOUT_NAME_LENGTH))}
          aria-label="Name of the Workout"
          placeholder="Give your Workout a Name"
          autoCorrect="off"
          autoComplete="off"
          className="focus-ring ml-2.5 min-w-0 flex-1 rounded-[10px] bg-field p-2.5 text-title outline-none placeholder:text-secondary-label"
        />
        <button
          type="button"
          aria-label="Add exercises"
          className="p-5 text-[#34c759] active:opacity-50 dark:text-[#30d158]"
          onClick={() => setShowExercises(true)}
        >
          <CirclePlus size={30} />
        </button>
      </div>

      <div className="px-5 py-5">
        <ReorderableRows
          items={workout.workoutExercises.map((row) => ({ key: row.id, name: row.exercise?.name ?? "" }))}
          editing
          rowClassName="bg-[#34c759] dark:bg-[#30d158]"
          onDelete={edits.remove}
          onMove={edits.move}
        />
      </div>

      <ExercisesSheet open={showExercises} onClose={() => setShowExercises(false)} onAdd={edits.add} />
    </div>
  );
}
