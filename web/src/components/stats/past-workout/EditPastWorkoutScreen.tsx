"use client";

import { notFound } from "next/navigation";
import { Download, Pencil, X } from "lucide-react";

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

function EditPastWorkout({ workout }: { workout: WorkoutWithExercises }) {
  const editor = useEditPastWorkout(workout);
  const { draft, trimmedName, isSaving } = editor;

  return (
    <div className="fixed inset-0 z-[90] overflow-y-auto bg-background pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex w-full max-w-3xl flex-col">
        <div className="flex items-center">
          <button
            type="button"
            aria-label="Cancel"
            onClick={editor.close}
            className="flex h-11 w-12 shrink-0 items-center justify-center text-[#ff3b30] active:opacity-50"
          >
            <X size={30} />
          </button>
          <input
            value={draft.name}
            onChange={(event) => editor.exercisesEdits.rename(prefixCharacters(event.target.value, MAX_WORKOUT_NAME_LENGTH))}
            placeholder="Name of the Workout"
            aria-label="Name of the Workout"
            aria-invalid={trimmedName === ""}
            autoCorrect="off"
            autoComplete="off"
            className="focus-ring my-2.5 min-w-0 flex-1 rounded-[6px] border border-separator bg-background px-1.5 py-1 text-title outline-none placeholder:text-secondary-label"
          />
          <button
            type="button"
            aria-label="Save"
            disabled={trimmedName === "" || isSaving}
            className="px-2.5 py-2.5 text-[#34c759] active:opacity-50 disabled:text-[#8e8e93] dark:text-[#30d158]"
            onClick={() => void editor.save()}
          >
            <Download size={28} />
          </button>
        </div>
        {trimmedName === "" && <p className="px-2.5 text-footnote text-[#ff3b30]">Enter a name.</p>}

        <label className="flex items-center justify-between p-2.5">
          <span className="text-headline font-semibold">Date</span>
          <input
            type="date"
            value={dayInputValue(draft.date)}
            max={dayInputValue(new Date())}
            onChange={(event) => editor.changeDay(event.target.value)}
            className="focus-ring rounded-[6px] bg-field px-2.5 py-1.5 text-body outline-none"
          />
        </label>

        <label className="flex items-center gap-4 p-2.5 pb-5">
          <span className="flex-1">Duration in Minutes</span>
          <input
            value={editor.enteredTime}
            inputMode="numeric"
            aria-label="Duration in Minutes"
            className="focus-ring w-24 rounded-[10px] bg-field py-0.5 text-center text-headline font-semibold outline-none"
            onChange={(event) => editor.changeDuration(event.target.value)}
            onBlur={editor.resetEnteredTime}
          />
        </label>

        <div className="flex items-center justify-center gap-2">
          <h2 className="text-title">Exercises</h2>
          <button
            type="button"
            aria-label="Edit Exercises"
            className="text-app active:opacity-50"
            onClick={editor.openEditSheet}
          >
            <Pencil size={22} />
          </button>
        </div>

        <div className="flex flex-col pt-2">
          {draft.workoutExercises.map((workoutExercise) => (
            <section key={workoutExercise.id} className="pb-[30px]">
              <h3 className="pb-1 pl-2.5 text-headline font-semibold">{workoutExercise.exercise?.name ?? ""}</h3>
              <EditWorkoutExercise workoutExercise={workoutExercise} actions={editor.setActions} />
            </section>
          ))}
        </div>
      </div>

      <EditWorkoutExercisesSheet
        open={editor.showEditSheet}
        onClose={editor.closeEditSheet}
        workout={draft}
        edits={editor.exercisesEdits}
      />
    </div>
  );
}
