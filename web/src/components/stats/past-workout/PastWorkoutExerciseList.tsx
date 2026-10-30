import { CircleCheck } from "lucide-react";

import { entryDescriptions } from "@/lib/domain/stats-screens";
import type { UserSettingsValues } from "@/lib/repo/hooks";
import type { WorkoutWithExercises } from "@/types/models";

/** The exercises of a past workout with the description of every set, in a bordered box */
export function PastWorkoutExerciseList({ workout, settings }: { workout: WorkoutWithExercises; settings: UserSettingsValues }) {
  return (
    <div className="m-2.5 rounded-[10px] border-2 border-foreground p-2.5">
      <ul>
        {workout.workoutExercises.map((workoutExercise) => (
          <li
            key={workoutExercise.id}
            className="flex items-start gap-2 border-b border-separator py-[11px] last:border-b-0"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="break-words">{workoutExercise.exercise?.name ?? ""}</span>
              {workoutExercise.exercise?.verified && (
                <CircleCheck size={18} className="shrink-0 text-[#007aff]" aria-label="Verified" />
              )}
            </span>
            <span className="flex-1" />
            <span className="flex shrink-0 flex-col items-end">
              {entryDescriptions(workoutExercise, settings).map((description, index) => (
                <span key={index}>{description}</span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
