"use client";

import { notFound } from "next/navigation";
import { CalendarDays, Clock, List, type LucideIcon } from "lucide-react";

import { ExerciseName } from "@/components/ui/ExerciseName";
import { SheetButton } from "@/components/ui/overlay";
import { EditWorkoutExercise } from "@/components/workout/EditWorkoutExercise";
import { EditWorkoutExercisesSheet } from "@/components/stats/EditWorkoutExercisesSheet";
import { prefixCharacters } from "@/lib/domain/format";
import { dayInputValue } from "@/lib/domain/past-workout-draft";
import { MAX_WORKOUT_NAME_LENGTH } from "@/lib/domain/workout";
import { useWorkout } from "@/lib/repo/hooks";
import type { WorkoutWithExercises } from "@/types/models";

import { useEditPastWorkout } from "./use-edit-past-workout";

/** Port of EditPastWorkoutView.swift */
export function EditPastWorkoutScreen({ workoutId }: { workoutId: string }) {
  const workout = useWorkout(workoutId);

  if (workout === undefined) return null;
  if (workout === null) notFound();
  return <EditPastWorkout workout={workout} />;
}

/** The name, the date and the duration of a draft, and a card with all sets per exercise. "Save" stores it. */
function EditPastWorkout({ workout }: { workout: WorkoutWithExercises }) {
  const editor = useEditPastWorkout(workout);
  const { draft, trimmedName, isSaving } = editor;
  const exercises = draft.workoutExercises;

  return (
    <div className="fixed inset-0 z-[90] overflow-y-auto bg-grouped pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] [--placeholder:rgba(60,60,67,0.3)] dark:[--placeholder:rgba(235,235,245,0.3)]">
      <div className="mx-auto flex w-full max-w-3xl flex-col">
        <header className="sticky top-0 z-10 flex h-11 shrink-0 items-center justify-between bg-grouped/90 px-4 backdrop-blur-xl">
          <SheetButton onClick={editor.close} className="z-10">
            Cancel
          </SheetButton>
          <h1 className="absolute inset-x-24 truncate text-center text-headline font-semibold">Edit workout</h1>
          <SheetButton bold disabled={trimmedName === "" || isSaving} onClick={() => void editor.save()} className="z-10">
            Save
          </SheetButton>
        </header>

        <div className="flex flex-col gap-3 px-4 pb-6 pt-2">
          {/* the name, the date and the duration */}
          <div className="card flex flex-col px-4">
            <div className="flex flex-col gap-1 py-3">
              <input
                value={draft.name}
                onChange={(event) => editor.exercisesEdits.rename(prefixCharacters(event.target.value, MAX_WORKOUT_NAME_LENGTH))}
                placeholder="Workout name"
                aria-label="Name of the workout"
                aria-invalid={trimmedName === ""}
                autoCorrect="off"
                autoComplete="off"
                enterKeyHint="done"
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
                className="w-full min-w-0 bg-transparent text-title3 font-semibold outline-none placeholder:font-normal placeholder:text-[var(--placeholder)]"
              />
              {trimmedName === "" && <p className="text-footnote text-[#ff3b30] dark:text-[#ff453a]">Enter a name.</p>}
            </div>

            <label className="flex min-h-11 items-center justify-between gap-3 border-t border-separator py-2">
              <DetailLabel icon={CalendarDays} title="Date" />
              <input
                type="date"
                value={dayInputValue(draft.date)}
                max={dayInputValue(new Date())}
                onChange={(event) => editor.changeDay(event.target.value)}
                className="focus-ring rounded-lg bg-field/40 px-2.5 py-1.5 text-body outline-none"
              />
            </label>

            <label className="flex min-h-11 items-center gap-2 border-t border-separator py-2">
              <span className="flex-1">
                <DetailLabel icon={Clock} title="Duration" />
              </span>
              <input
                value={editor.enteredTime}
                inputMode="numeric"
                placeholder="0"
                aria-label="Duration in minutes"
                onChange={(event) => editor.changeDuration(event.target.value)}
                onBlur={editor.resetEnteredTime}
                className="h-9 w-16 rounded-lg bg-field/40 text-center font-rounded font-semibold tabular-nums outline-none focus:ring-2 focus:ring-inset focus:ring-app"
              />
              <span className="text-secondary-label" aria-hidden>
                min
              </span>
            </label>
          </div>

          <div className="flex items-baseline justify-between px-1 pt-3">
            <h2 className="text-title3 font-bold">Exercises</h2>
            <button
              type="button"
              aria-label="Edit exercises"
              onClick={editor.openEditSheet}
              className="flex items-center gap-1.5 text-subheadline font-medium text-app active:opacity-50"
            >
              <List size={16} strokeWidth={2.5} aria-hidden />
              Edit
            </button>
          </div>

          {exercises.length === 0 && (
            <p className="card p-4 text-subheadline text-secondary-label">This workout has no exercises. Add them with Edit.</p>
          )}

          {exercises.map((workoutExercise, index) => (
            <section key={workoutExercise.id} className="card flex flex-col gap-3 p-4" aria-label={workoutExercise.exercise?.name}>
              <div className="flex items-center gap-2.5">
                <span
                  className="flex size-7 shrink-0 items-center justify-center rounded-full bg-app/15 text-subheadline font-semibold tabular-nums text-app"
                  aria-hidden
                >
                  {index + 1}
                </span>
                <ExerciseName
                  name={workoutExercise.exercise?.name ?? ""}
                  verified={workoutExercise.exercise?.verified ?? false}
                  className="min-w-0 truncate text-headline font-semibold"
                />
              </div>
              {/* all sets: the page scrolls */}
              <EditWorkoutExercise workoutExercise={workoutExercise} limitsRows={false} actions={editor.setActions} />
            </section>
          ))}
        </div>
      </div>

      <EditWorkoutExercisesSheet open={editor.showEditSheet} onClose={editor.closeEditSheet} workout={draft} edits={editor.exercisesEdits} />
    </div>
  );
}

function DetailLabel({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <span className="flex items-center gap-3">
      <Icon size={20} className="w-6 shrink-0 text-app" aria-hidden />
      {title}
    </span>
  );
}
