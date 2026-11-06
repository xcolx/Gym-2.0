"use client";

// Port of ios/Gym 2.0/Features/Workout/ActiveWorkout/PerformingExerciseView.swift

import { Info } from "lucide-react";

import { ExerciseHistoryCard } from "@/components/stats/ExerciseHistoryCard";
import { ExerciseName } from "@/components/ui/ExerciseName";
import { EditWorkoutExercise } from "@/components/workout/EditWorkoutExercise";
import { summaryOfWorkoutExercises } from "@/lib/domain/stats";
import { personalRecordSet } from "@/lib/domain/stats-overview";
import { useUserSettings } from "@/lib/repo/hooks";
import { useExerciseHistory } from "@/lib/repo";
import { UnitSystem, type LocalId, type WorkoutExerciseWithExercise } from "@/types/models";

/**
 * An exercise of the workout in progress: a slim title, the set table and the past times the exercise was done. Not one
 * scroll view: the sets stay in place however long the history is, it scrolls on its own.
 */
export function PerformingExercise({
  workoutExercise,
  number,
  exerciseCount,
  workoutId,
  onShowExercise,
}: {
  workoutExercise: WorkoutExerciseWithExercise;
  /** The position of the exercise in the workout, from 1 */
  number: number;
  exerciseCount: number;
  workoutId: LocalId;
  onShowExercise: (exerciseId: LocalId) => void;
}) {
  const exercise = workoutExercise.exercise;
  const history = useExerciseHistory(workoutExercise.exerciseId);
  const settings = useUserSettings();
  const units = { weightUnit: settings?.weightUnit ?? UnitSystem.metric, distanceUnit: settings?.distanceUnit ?? UnitSystem.metric };
  const record = exercise && history ? personalRecordSet(exercise, history, summaryOfWorkoutExercises(history)) : null;

  return (
    <div className="flex h-full flex-col gap-3 px-4 pb-2">
      {/* one slim line, so that the sets get the space */}
      <div className="flex min-h-9 shrink-0 items-center gap-2.5 px-1 pt-1">
        <span
          className="shrink-0 rounded-full bg-app/15 px-2 py-[3px] text-caption1 font-bold tabular-nums text-app"
          aria-label={`Exercise ${number} of ${exerciseCount}`}
        >
          {number}/{exerciseCount}
        </span>
        <ExerciseName name={exercise?.name ?? ""} verified={exercise?.verified ?? false} className="min-w-0 flex-1 truncate text-headline font-semibold" />
        {exercise && (
          // The exercise can't be added again from the performing workout
          <button
            type="button"
            aria-label={`Details of ${exercise.name}`}
            onClick={() => onShowExercise(exercise.id)}
            className="-mr-2 flex size-9 shrink-0 items-center justify-center text-app active:opacity-50"
          >
            <Info size={22} aria-hidden />
          </button>
        )}
      </div>

      <div className="card shrink-0 p-4">
        <EditWorkoutExercise workoutExercise={workoutExercise} stopwatchWorkoutId={workoutId} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2.5 pt-2">
        <h2 className="px-1 text-title3 font-bold">History</h2>
        {history && history.length === 0 && (
          <p className="card p-4 text-subheadline text-secondary-label">
            You have never done this exercise. You will see your past workouts with this exercise here.
          </p>
        )}
        {history && history.length > 0 && <ExerciseHistoryCard history={history} record={record} units={units} scrolls />}
      </div>
    </div>
  );
}
