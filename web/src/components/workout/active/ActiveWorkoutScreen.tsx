"use client";

import { useRef, useState } from "react";
import { List, X } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { FullScreenCover } from "@/components/ui/overlay";
import { DeleteWorkoutConfirmation } from "@/components/workout/DeleteWorkoutConfirmation";
import { EditPerformingWorkout } from "@/components/workout/EditPerformingWorkout";
import { EndWorkout } from "@/components/workout/EndWorkout";
import { ExerciseDetail } from "@/components/workout/ExerciseDetail";
import { PerformingExercise } from "@/components/workout/PerformingExercise";
import { WorkoutPager, type WorkoutPagerHandle } from "@/components/workout/WorkoutPager";
import { formatWorkoutEnd } from "@/lib/domain/workout-end";
import type { WorkoutWithExercises } from "@/types/models";

import { useActiveWorkout, useDoneSetCounts, useWhilstWorkout } from "./use-active-workout";
import { WorkoutTimer } from "./WorkoutTimer";

/**
 * Port of WhilstWorkoutView.swift. If the workout is deleted or ended elsewhere it leaves to the workout tab, like
 * ending or cancelling it here.
 */
export function ActiveWorkoutScreen({ workoutId }: { workoutId: string }) {
  const { workout, leavingRef, leave } = useActiveWorkout(workoutId);

  if (workout === undefined) return null;
  if (!workout || !workout.inProgress) {
    return (
      <main className="screen flex items-center justify-center p-6 text-center">
        {workout === null ? "This workout doesn't exist anymore." : null}
      </main>
    );
  }
  return <WhilstWorkout workout={workout} leavingRef={leavingRef} onLeave={leave} />;
}

function WhilstWorkout({
  workout,
  leavingRef,
  onLeave,
}: {
  workout: WorkoutWithExercises;
  leavingRef: React.RefObject<boolean>;
  onLeave: () => void;
}) {
  const whilst = useWhilstWorkout(workout, leavingRef, onLeave);
  const { suggestedEnd, shownExercise, closeExercise } = whilst;
  const pager = useRef<WorkoutPagerHandle>(null);
  // The index of the exercise shown, the number of exercises for the finish page
  const [page, setPage] = useState(0);
  const doneCounts = useDoneSetCounts(workout);
  const exercises = workout.workoutExercises;

  const pages = exercises.map((workoutExercise, index) => ({
    key: workoutExercise.id,
    label: workoutExercise.exercise?.name ?? "Exercise",
    hasSets: doneCounts[index] > 0,
    content: (
      <PerformingExercise
        workoutExercise={workoutExercise}
        number={index + 1}
        exerciseCount={exercises.length}
        workoutId={workout.id}
        onShowExercise={whilst.showExercise}
      />
    ),
  }));

  return (
    <main className="mx-auto flex h-[calc(100dvh-var(--tabbar-h)-env(safe-area-inset-bottom))] w-full max-w-3xl flex-col bg-grouped md:h-dvh">
      <header className="shrink-0 pt-[env(safe-area-inset-top)] md:pt-4">
        <div className="relative flex h-11 items-center justify-between px-2">
          <button
            type="button"
            aria-label="Cancel workout"
            onClick={whilst.askToCancel}
            className="z-10 flex size-11 items-center justify-center text-secondary-label active:opacity-50"
          >
            <X size={22} strokeWidth={2.5} />
          </button>
          <div className="absolute inset-x-14 flex flex-col items-center leading-tight">
            <h1 className="max-w-full truncate text-headline font-semibold">{workout.name}</h1>
            <WorkoutTimer start={workout.date} />
          </div>
          <button
            type="button"
            aria-label="Workout overview"
            onClick={whilst.startEditing}
            className="z-10 flex size-11 items-center justify-center text-app active:opacity-50"
          >
            <List size={22} strokeWidth={2.5} />
          </button>
        </div>
      </header>

      <WorkoutPager
        ref={pager}
        pages={pages}
        finish={<EndWorkout workout={workout} onEnd={() => void whilst.askToEnd()} />}
        storageKey={`gym2.workoutPage.${workout.id}`}
        onPageChange={setPage}
      />

      <DeleteWorkoutConfirmation open={whilst.asksToCancel} onClose={whilst.closeCancel} onDelete={() => void whilst.cancel()} />
      <Alert
        open={whilst.asksToDiscardEmpty}
        title="Nothing entered"
        message="No set of this workout has a value, so there is nothing to save. Do you want to discard the workout?"
        buttons={[
          { label: "Go back", role: "cancel" },
          { label: "Discard", role: "destructive", onSelect: () => void whilst.cancel() },
        ]}
        onClose={whilst.closeDiscardEmpty}
      />
      <Alert
        open={suggestedEnd !== null}
        title="End the workout at your last change?"
        message={suggestedEnd ? `Your last change was at ${formatWorkoutEnd(suggestedEnd)}. Did the workout end then?` : undefined}
        buttons={[
          {
            label: suggestedEnd ? `End at ${formatWorkoutEnd(suggestedEnd)}` : "End then",
            isDefault: true,
            onSelect: () => suggestedEnd && void whilst.end(suggestedEnd),
          },
          { label: "End now", onSelect: () => void whilst.end() },
          { label: "Go back", role: "cancel" },
        ]}
        onClose={whilst.closeSuggestedEnd}
      />
      <EditPerformingWorkout
        open={whilst.editing}
        workout={workout}
        currentExerciseId={exercises[page]?.id ?? null}
        onSelect={(index) => pager.current?.show(index)}
        onDeleteWorkout={() => void whilst.cancel()}
        onClose={whilst.stopEditing}
      />
      <FullScreenCover open={shownExercise !== null} onClose={closeExercise} label="Exercise" grouped>
        {shownExercise && <ExerciseDetail exerciseId={shownExercise} backLabel="Workout" onBack={closeExercise} />}
      </FullScreenCover>
    </main>
  );
}
