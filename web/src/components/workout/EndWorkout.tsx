"use client";

// Port of ios/Gym 2.0/Features/Workout/ActiveWorkout/EndWorkoutView.swift

import { useState } from "react";
import { Check, Circle, Flag, Plus } from "lucide-react";

import { HighlightedBody } from "@/components/ui/HighlightedBody";
import { MuscleLegend, PRIMARY_MUSCLE_COLOR, SECONDARY_MUSCLE_COLOR } from "@/components/ui/MuscleLegend";
import { BottomActionBar, PrimaryButton } from "@/components/ui/PrimaryButton";
import { SquareActionButton } from "@/components/workout/EditWorkout";
import { ExercisesSheet } from "@/components/workout/ExercisesSheet";
import { doneSetsText, exercisesWithSetsText } from "@/lib/domain/active-workout";
import { formatDuration } from "@/lib/domain/stats";
import { formatVolume } from "@/lib/domain/units";
import { volume } from "@/lib/domain/workout-exercise";
import { musclesWorked } from "@/lib/domain/workout-setup";
import { addExercisesToWorkout } from "@/lib/repo";
import { useMuscles, useUserSettings } from "@/lib/repo/hooks";
import { useNow } from "@/lib/use-now";
import { UnitSystem, type Exercise, type WorkoutWithExercises } from "@/types/models";
import { useDoneSetCounts } from "./active/use-active-workout";

/** The last page of the workout in progress: what was done, the muscles trained, more exercises and finishing it */
export function EndWorkout({ workout, onEnd }: { workout: WorkoutWithExercises; onEnd: () => void }) {
  const [showsExercises, setShowsExercises] = useState(false);
  const settings = useUserSettings();
  const muscles = useMuscles();
  const now = useNow(60_000);

  const exercises = workout.workoutExercises;
  const doneCounts = useDoneSetCounts(workout);
  const doneExercises = doneCounts.filter((count) => count > 0).length;
  // only the exercises with sets: a muscle is trained if any of them trains it as primary muscle
  const trained = musclesWorked(
    exercises.flatMap(({ exercise }, index): Exercise[] => (exercise && doneCounts[index] > 0 ? [exercise] : [])),
    muscles ?? [],
  );
  const minutes = now > 0 ? Math.max(0, Math.trunc((now - workout.date.getTime()) / 60_000)) : 0;
  const totalVolume = exercises.reduce((sum, workoutExercise) => sum + volume(workoutExercise), 0);

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-y-contain px-4 pb-10 *:shrink-0">
        <div className="flex flex-col items-center gap-1 pt-2 text-center">
          <h2 className="text-title font-bold">{doneExercises === 0 ? "Ready to finish?" : "Nice work"}</h2>
          <p className="text-subheadline text-secondary-label">{exercisesWithSetsText(doneExercises, exercises.length)}</p>
        </div>

        <div className="flex gap-2.5">
          <SummaryTile value={formatDuration(minutes)} label="Time" />
          <SummaryTile value={String(doneCounts.reduce((sum, count) => sum + count, 0))} label="Sets" />
          <SummaryTile value={formatVolume(totalVolume, settings?.weightUnit ?? UnitSystem.metric)} label="Volume" />
        </div>

        <div className="card flex items-center gap-4 p-4">
          <HighlightedBody className="h-[170px] shrink-0" primaryMuscles={trained.primary} secondaryMuscles={trained.secondary} />
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <MuscleLegend color={PRIMARY_MUSCLE_COLOR} title="Trained" muscles={trained.primary} />
            {trained.secondary.length > 0 && <MuscleLegend color={SECONDARY_MUSCLE_COLOR} title="A bit" muscles={trained.secondary} />}
          </div>
        </div>

        <ul className="card overflow-hidden">
          {exercises.map((workoutExercise, index) => {
            const done = doneCounts[index];
            return (
              <li key={workoutExercise.id} className="flex items-center gap-2.5 pl-4">
                {done > 0 ? (
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-app text-app-foreground" aria-label="Done">
                    <Check size={13} strokeWidth={3.5} />
                  </span>
                ) : (
                  <Circle size={20} className="shrink-0 text-tab-inactive/60" aria-label="Not done" />
                )}
                <span className={`flex min-w-0 flex-1 items-center gap-2.5 py-[11px] pr-4 ${index > 0 ? "border-t border-separator" : ""}`}>
                  <span className={`min-w-0 flex-1 truncate ${done > 0 ? "" : "text-secondary-label"}`}>{workoutExercise.exercise?.name ?? ""}</span>
                  <span className="shrink-0 text-subheadline text-secondary-label">{doneSetsText(done)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <BottomActionBar inPane>
        <SquareActionButton label="Add exercise" tinted onClick={() => setShowsExercises(true)}>
          <Plus size={22} strokeWidth={2.5} aria-hidden />
        </SquareActionButton>
        <PrimaryButton onClick={onEnd}>
          <Flag size={18} strokeWidth={2.5} className="mr-1.5" aria-hidden />
          Finish workout
        </PrimaryButton>
      </BottomActionBar>

      <ExercisesSheet
        open={showsExercises}
        onClose={() => setShowsExercises(false)}
        onAdd={(added) => void addExercisesToWorkout(workout.id, added.map((exercise) => exercise.id))}
      />
    </div>
  );
}

/** One of the totals of the finish page */
function SummaryTile({ value, label }: { value: string; label: string }) {
  return (
    <div className="card flex min-w-0 flex-1 flex-col items-center gap-0.5 px-2 py-3">
      <span className="max-w-full truncate font-rounded text-headline font-semibold tabular-nums">{value}</span>
      <span className="text-caption1 text-secondary-label">{label}</span>
    </div>
  );
}
