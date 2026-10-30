"use client";

// Port of ios/Gym 2.0/Features/Workout/ActiveWorkout/EditPerformingWorkoutView.swift. Every change is stored right
// away.

import { useState } from "react";
import { CirclePlus } from "lucide-react";

import { ReorderableRows, WorkoutNameField } from "@/components/workout/EditWorkout";
import { ExercisesSheet } from "@/components/workout/ExercisesSheet";
import { Sheet } from "@/components/ui/overlay";
import { addExercisesToWorkout, moveWorkoutExercise, removeExerciseFromWorkout, renameWorkout } from "@/lib/repo";
import { useBoundText } from "@/lib/use-bound-text";
import type { WorkoutWithExercises } from "@/types/models";

export function EditPerformingWorkout({ open, workout, onClose }: { open: boolean; workout: WorkoutWithExercises; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} label="Edit Workout">
      <EditPerformingWorkoutContent workout={workout} onClose={onClose} />
    </Sheet>
  );
}

function EditPerformingWorkoutContent({ workout, onClose }: { workout: WorkoutWithExercises; onClose: () => void }) {
  // Bound to the stored name, while the field is empty the workout keeps its last name (the server needs one character)
  const title = useBoundText(workout.name);
  const [showsExercises, setShowsExercises] = useState(false);

  return (
    <>
      <div className="flex h-11 shrink-0 items-center justify-end px-2">
        <button type="button" className="h-11 px-2 text-body font-semibold text-app active:opacity-50" onClick={onClose}>
          Done
        </button>
      </div>
      <div className="flex shrink-0 items-center gap-1 pl-2.5">
        <WorkoutNameField
          value={title.text}
          onChange={(name) => {
            const trimmed = name.trim();
            title.change(name, trimmed === "" ? null : trimmed);
            void renameWorkout(workout.id, name);
          }}
          onBlur={title.end}
        />
        <button
          type="button"
          aria-label="Add exercise"
          onClick={() => setShowsExercises(true)}
          className="flex h-[60px] w-[60px] shrink-0 items-center justify-center text-[#34c759] active:opacity-50"
        >
          <CirclePlus size={30} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <ReorderableRows
          items={workout.workoutExercises.map((we) => ({ key: we.id, name: we.exercise?.name ?? "" }))}
          editing
          rowClassName="bg-[#34c759]"
          onDelete={(index) => void removeExerciseFromWorkout(workout.workoutExercises[index].id)}
          onMove={(from, to) => void moveWorkoutExercise(workout.id, from, to)}
        />
      </div>

      <ExercisesSheet
        open={showsExercises}
        onClose={() => setShowsExercises(false)}
        onAdd={(exercise) => void addExercisesToWorkout(workout.id, [exercise.id])}
      />
    </>
  );
}
