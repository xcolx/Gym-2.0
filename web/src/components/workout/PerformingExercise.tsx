"use client";

// Port of ios/Gym 2.0/Features/Workout/ActiveWorkout/PerformingExerciseView.swift

import { CircleCheck } from "lucide-react";

import { EditWorkoutExercise } from "@/components/workout/EditWorkoutExercise";
import { formatDate } from "@/lib/domain/format";
import { entryCount, entryDescription } from "@/lib/domain/workout-exercise";
import { useUserSettings } from "@/lib/repo/hooks";
import { useExerciseHistory } from "@/lib/repo";
import { UnitSystem, type LocalId, type WorkoutExerciseWithExercise } from "@/types/models";

export function PerformingExercise({
  workoutExercise,
  workoutId,
  onShowExercise,
}: {
  workoutExercise: WorkoutExerciseWithExercise;
  workoutId: LocalId;
  onShowExercise: (exerciseId: LocalId) => void;
}) {
  const exercise = workoutExercise.exercise;
  const history = useExerciseHistory(workoutExercise.exerciseId);
  const settings = useUserSettings();
  const weightUnit = settings?.weightUnit ?? UnitSystem.metric;
  const distanceUnit = settings?.distanceUnit ?? UnitSystem.metric;

  const title = (
    <span className="flex items-center gap-1.5 pl-2.5 text-left text-headline font-semibold">
      {exercise?.name ?? ""}
      {exercise?.verified && <CircleCheck size={18} className="shrink-0 text-[#007aff]" aria-label="Verified" />}
    </span>
  );

  return (
    <div className="flex min-h-full flex-col px-2.5 pb-2.5">
      <div className="flex min-h-11 items-center">
        {exercise ? (
          // The exercise can't be added again from the performing workout
          <button type="button" className="min-h-11 active:opacity-50" onClick={() => onShowExercise(exercise.id)}>
            {title}
          </button>
        ) : (
          title
        )}
      </div>

      <EditWorkoutExercise workoutExercise={workoutExercise} stopwatchWorkoutId={workoutId} />

      <div className="mt-2.5 flex flex-1 flex-col">
        <p className="pl-2.5">History:</p>
        <div className="mx-2.5 mt-1 flex-1 rounded-[10px] border-2 border-my-black px-0.5 py-2.5">
          {history && history.length === 0 && (
            <p className="px-3 py-2">You have never done this exercise. You will see your past workouts with this exercise here.</p>
          )}
          <ul>
            {history?.map((past) => (
              <li key={past.id} className="flex items-start gap-2 border-b border-separator px-3 py-2 last:border-b-0">
                <span className="shrink-0">{formatDate(past.workout.date)}</span>
                <span className="min-w-0 flex-1 break-words text-center">{past.workout.name}</span>
                <span className="flex shrink-0 flex-col items-end">
                  {Array.from({ length: entryCount(past) }, (_, index) => (
                    <span key={index}>{entryDescription(past, index, weightUnit, distanceUnit)}</span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
