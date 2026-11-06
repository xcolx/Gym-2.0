import { ExerciseName } from "@/components/ui/ExerciseName";
import { entryDescriptions } from "@/lib/domain/stats-screens";
import type { UserSettingsValues } from "@/lib/repo/hooks";
import type { WorkoutWithExercises } from "@/types/models";

/** The exercises of a past workout as cards, with the description of every set (PastWorkoutDetailView.swift) */
export function PastWorkoutExerciseList({ workout, settings }: { workout: WorkoutWithExercises; settings: UserSettingsValues }) {
  return (
    <ul className="flex flex-col gap-4">
      {[...workout.workoutExercises]
        .sort((a, b) => a.index - b.index)
        .map((workoutExercise) => (
          <li key={workoutExercise.id} className="card flex flex-col gap-2 p-4">
            <ExerciseName
              name={workoutExercise.exercise?.name ?? ""}
              verified={workoutExercise.exercise?.verified === true}
              className="text-headline font-semibold"
            />
            <ol className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-subheadline">
              {entryDescriptions(workoutExercise, settings).map((description, index) => (
                <li key={index} className="col-span-2 grid grid-cols-subgrid">
                  <span className="text-right text-secondary-label tabular-nums">{index + 1}</span>
                  <span>{description}</span>
                </li>
              ))}
            </ol>
          </li>
        ))}
    </ul>
  );
}
