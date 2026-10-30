"use client";

import { CircleX, Pencil } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { FullScreenCover } from "@/components/ui/overlay";
import { EditPerformingWorkout } from "@/components/workout/EditPerformingWorkout";
import { EndWorkout } from "@/components/workout/EndWorkout";
import { ExerciseDetail } from "@/components/workout/ExerciseDetail";
import { PerformingExercise } from "@/components/workout/PerformingExercise";
import { WorkoutPager } from "@/components/workout/WorkoutPager";
import { formatWorkoutEnd } from "@/lib/domain/workout-end";
import type { WorkoutWithExercises } from "@/types/models";

import { useActiveWorkout, useWhilstWorkout } from "./use-active-workout";
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

  const pages = [
    ...workout.workoutExercises.map((workoutExercise) => ({
      key: workoutExercise.id,
      label: workoutExercise.exercise?.name ?? "Exercise",
      content: <PerformingExercise workoutExercise={workoutExercise} workoutId={workout.id} onShowExercise={whilst.showExercise} />,
    })),
    { key: "end", label: "End Workout", content: <EndWorkout workoutId={workout.id} onEnd={() => void whilst.askToEnd()} /> },
  ];

  return (
    <main className="mx-auto flex h-[calc(100dvh-var(--tabbar-h)-env(safe-area-inset-bottom))] w-full max-w-3xl flex-col md:h-dvh">
      <header className="shrink-0 pt-[env(safe-area-inset-top)] md:pt-4">
        <div className="relative flex h-11 items-center justify-between px-2">
          <WorkoutTimer start={workout.date} />
          <h1 className="pointer-events-none absolute inset-x-28 text-center text-headline font-semibold">Workout</h1>
          <div className="flex items-center">
            <button
              type="button"
              aria-label="Cancel workout"
              onClick={whilst.askToCancel}
              className="flex h-11 w-11 items-center justify-center text-[#ff3b30] active:opacity-50"
            >
              <CircleX size={28} />
            </button>
            <button
              type="button"
              aria-label="Edit workout"
              onClick={whilst.startEditing}
              className="flex h-11 w-11 items-center justify-center text-app active:opacity-50"
            >
              <Pencil size={26} />
            </button>
          </div>
        </div>
      </header>

      <WorkoutPager pages={pages} storageKey={`gym2.workoutPage.${workout.id}`} />

      <Alert
        open={whilst.asksToCancel}
        title="Cancel your workout?"
        message="If you cancel your workout, nothing will be saved."
        buttons={[
          { label: "Go back", role: "cancel" },
          { label: "Delete", role: "destructive", onSelect: () => void whilst.cancel() },
        ]}
        onClose={whilst.closeCancel}
      />
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
      <EditPerformingWorkout open={whilst.editing} workout={workout} onClose={whilst.stopEditing} />
      <FullScreenCover open={shownExercise !== null} onClose={closeExercise} label="Exercise">
        {shownExercise && <ExerciseDetail exerciseId={shownExercise} backLabel="Workout" onBack={closeExercise} />}
      </FullScreenCover>
    </main>
  );
}
