"use client";

// Port of ios/Gym 2.0/Features/Workout/ActiveWorkout/EndWorkoutView.swift

import { useState } from "react";
import { CirclePlus } from "lucide-react";

import { ExercisesSheet } from "@/components/workout/ExercisesSheet";
import { PillButton } from "@/components/ui/Page";
import { addExercisesToWorkout } from "@/lib/repo";
import type { LocalId } from "@/types/models";

export function EndWorkout({ workoutId, onEnd }: { workoutId: LocalId; onEnd: () => void }) {
  const [showsExercises, setShowsExercises] = useState(false);

  return (
    <div className="flex min-h-full flex-col items-center bg-my-gray/40 px-4 text-center">
      <div className="flex-1" />
      <p className="text-large-title">You are done!</p>
      <p className="text-large-title">Or are you?</p>
      <div className="flex-1" />
      <button
        type="button"
        aria-label="Add exercise"
        onClick={() => setShowsExercises(true)}
        className="text-[#34c759] active:opacity-50"
      >
        <CirclePlus size={100} strokeWidth={1.5} />
      </button>
      <p className="text-title">Add exercise</p>
      <div className="flex-1" />
      <PillButton onClick={onEnd}>End Workout</PillButton>
      <div className="flex-1" />

      <ExercisesSheet
        open={showsExercises}
        onClose={() => setShowsExercises(false)}
        onAdd={(exercise) => void addExercisesToWorkout(workoutId, [exercise.id])}
      />
    </div>
  );
}
