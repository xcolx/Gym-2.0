"use client";

// Port of ios/Gym 2.0/Features/Workout/ActiveWorkout/EditPerformingWorkoutView.swift. Every change is stored right
// away.

import { useState } from "react";
import { CirclePlus, Trash2 } from "lucide-react";

import { ButtonRow, FormRow, FormSection, FormStack } from "@/components/ui/Form";
import { ReorderableList } from "@/components/ui/ReorderableList";
import { afterOverlayClose, Sheet, SheetButton } from "@/components/ui/overlay";
import { DeleteWorkoutConfirmation } from "@/components/workout/DeleteWorkoutConfirmation";
import { WorkoutNameField } from "@/components/workout/EditWorkout";
import { ExercisesSheet } from "@/components/workout/ExercisesSheet";
import { doneSetsText } from "@/lib/domain/active-workout";
import { exerciseCountText } from "@/lib/domain/workout-setup";
import { addExercisesToWorkout, moveWorkoutExercise, removeExerciseFromWorkout, renameWorkout } from "@/lib/repo";
import { useBoundText } from "@/lib/use-bound-text";
import type { LocalId, WorkoutWithExercises } from "@/types/models";
import { useDoneSetCounts } from "./active/use-active-workout";

const ROW_HEIGHT = 52;

/**
 * The name and the exercises of the workout in progress. Tapping an exercise shows it, its handle moves it and a swipe
 * to the left removes it. "Cancel workout" at the bottom asks twice before it deletes the workout.
 */
export function EditPerformingWorkout({
  open,
  workout,
  currentExerciseId,
  onSelect,
  onDeleteWorkout,
  onClose,
}: {
  open: boolean;
  workout: WorkoutWithExercises;
  /** The exercise shown in the workout, highlighted in the list */
  currentExerciseId?: LocalId | null;
  /** Tapping an exercise shows it in the workout */
  onSelect?: (index: number) => void;
  onDeleteWorkout?: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Workout"
      trailing={
        <SheetButton bold onClick={onClose}>
          Done
        </SheetButton>
      }
      grouped
    >
      <EditPerformingWorkoutContent
        workout={workout}
        currentExerciseId={currentExerciseId}
        onSelect={onSelect}
        onDeleteWorkout={onDeleteWorkout}
        onClose={onClose}
      />
    </Sheet>
  );
}

function EditPerformingWorkoutContent({
  workout,
  currentExerciseId,
  onSelect,
  onDeleteWorkout,
  onClose,
}: {
  workout: WorkoutWithExercises;
  currentExerciseId?: LocalId | null;
  onSelect?: (index: number) => void;
  onDeleteWorkout?: () => void;
  onClose: () => void;
}) {
  // Bound to the stored name, while the field is empty the workout keeps its last name (the server needs one character)
  const title = useBoundText(workout.name);
  const [showsExercises, setShowsExercises] = useState(false);
  const [asksToDelete, setAsksToDelete] = useState(false);
  const exercises = workout.workoutExercises;
  const doneCounts = useDoneSetCounts(workout);

  return (
    <FormStack>
      <FormSection header="Name">
        <FormRow className="py-0" rowClassName="focus-ring-within rounded-[20px]">
          <WorkoutNameField
            value={title.text}
            onChange={(name) => {
              const trimmed = name.trim();
              title.change(name, trimmed === "" ? null : trimmed);
              void renameWorkout(workout.id, name);
            }}
            onBlur={title.end}
          />
        </FormRow>
      </FormSection>

      <FormSection
        header={exerciseCountText(exercises.length)}
        footer={
          onSelect
            ? "Tap an exercise to go to it, drag the handle to move it, swipe to remove it."
            : "Drag the handle of an exercise to move it, swipe to remove it."
        }
      >
        <ReorderableList
          items={exercises.map((workoutExercise) => ({ key: workoutExercise.id, label: workoutExercise.exercise?.name ?? "" }))}
          rowHeight={ROW_HEIGHT}
          onMove={(from, to) => void moveWorkoutExercise(workout.id, from, to)}
          onDelete={(index) => void removeExerciseFromWorkout(exercises[index].id)}
          renderRow={(index) => {
            const workoutExercise = exercises[index];
            const isCurrent = workoutExercise.id === currentExerciseId;
            const done = doneCounts[index];
            const row = (
              <>
                <span
                  className={`flex size-[30px] shrink-0 items-center justify-center rounded-full text-subheadline font-semibold tabular-nums ${
                    isCurrent ? "bg-app text-app-foreground" : "bg-app/15 text-app"
                  }`}
                >
                  {index + 1}
                </span>
                <span className={`min-w-0 flex-1 truncate ${isCurrent ? "font-semibold" : ""}`}>{workoutExercise.exercise?.name ?? ""}</span>
                <span className={`shrink-0 text-subheadline ${isCurrent ? "text-app" : "text-secondary-label"}`}>
                  {isCurrent ? "Now" : done === 0 ? "–" : doneSetsText(done)}
                </span>
              </>
            );
            return onSelect ? (
              <button
                type="button"
                onClick={() => {
                  onSelect(index);
                  onClose();
                }}
                className="flex w-full items-center gap-3 py-2 text-left"
              >
                {row}
              </button>
            ) : (
              <div className="flex items-center gap-3 py-2">{row}</div>
            );
          }}
        />
        <ButtonRow onClick={() => setShowsExercises(true)}>
          <CirclePlus size={22} className="fill-current [&>path]:stroke-[var(--cell-bg)]" aria-hidden />
          Add exercises
        </ButtonRow>
      </FormSection>

      {onDeleteWorkout && (
        <FormSection>
          <ButtonRow destructive onClick={() => setAsksToDelete(true)}>
            <Trash2 size={20} aria-hidden />
            Cancel workout
          </ButtonRow>
        </FormSection>
      )}

      <ExercisesSheet
        open={showsExercises}
        onClose={() => setShowsExercises(false)}
        onAdd={(added) => void addExercisesToWorkout(workout.id, added.map((exercise) => exercise.id))}
      />
      {onDeleteWorkout && (
        <DeleteWorkoutConfirmation
          open={asksToDelete}
          onClose={() => setAsksToDelete(false)}
          onDelete={() => {
            onClose();
            // after the sheet removed its history entry, which would undo leaving the workout
            afterOverlayClose(onDeleteWorkout);
          }}
        />
      )}
    </FormStack>
  );
}
