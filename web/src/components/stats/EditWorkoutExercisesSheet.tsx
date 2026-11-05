"use client";

import { useState } from "react";

import { FormStack } from "@/components/ui/Form";
import { WorkoutExercisesSection } from "@/components/workout/EditPerformingWorkout";
import { ExercisesSheet } from "@/components/workout/ExercisesSheet";
import type { Exercise, WorkoutWithExercises } from "@/types/models";
import { Sheet, SheetButton } from "@/components/ui/overlay";

/** The changes of the sheet and the edit page, made to the draft of the edited workout */
export interface WorkoutExercisesEdits {
  rename(name: string): void;
  add(exercise: Exercise): void;
  /** By the position in the sorted list */
  remove(index: number): void;
  move(from: number, to: number): void;
}

/**
 * Port of EditPerformingWorkoutView.swift as the sheet of EditPastWorkoutView (without the name, which is on the edit
 * page): the exercises, moved by their handle and removed by a swipe, and "Add exercises". It changes the draft of the
 * edit page, which is only stored with its "Save".
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
      title="Exercises"
      trailing={
        <SheetButton bold onClick={onClose}>
          Done
        </SheetButton>
      }
      grouped
    >
      {open && <EditExercises workout={workout} edits={edits} />}
    </Sheet>
  );
}

function EditExercises({ workout, edits }: { workout: WorkoutWithExercises; edits: WorkoutExercisesEdits }) {
  const [showExercises, setShowExercises] = useState(false);

  return (
    <FormStack>
      <WorkoutExercisesSection
        workout={workout}
        onMove={edits.move}
        onDelete={edits.remove}
        onAddExercises={() => setShowExercises(true)}
      />
      <ExercisesSheet open={showExercises} onClose={() => setShowExercises(false)} onAdd={(exercises) => exercises.forEach(edits.add)} />
    </FormStack>
  );
}
