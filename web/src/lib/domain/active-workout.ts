// The UI-independent parts of WhilstWorkoutView.swift, EndWorkoutView.swift and EditPerformingWorkoutView.swift

import type { WorkoutExercise } from "@/types/models";
import { entryCount, isEntryEmpty, type SetArrays } from "./workout-exercise";

/**
 * The sets with a value (EndWorkoutView.doneSets). A unilateral set counts once, if either of its sides has a value.
 * The weight of a bodyweight exercise doesn't count while it's the bodyweight.
 */
export function doneSetCount(
  workoutExercise: SetArrays & Pick<WorkoutExercise, "unilateral">,
  usesBodyweight: boolean,
  bodyweight: number,
): number {
  const done = new Set<number>();
  for (let index = 0; index < entryCount(workoutExercise); index++) {
    if (!isEntryEmpty(workoutExercise, index, usesBodyweight, bodyweight)) {
      done.add(workoutExercise.unilateral ? Math.trunc(index / 2) : index);
    }
  }
  return done.size;
}

/** The sets of an exercise on the finish page: "Empty", "1 set", "3 sets" */
export function doneSetsText(count: number): string {
  if (count === 0) return "Empty";
  return count === 1 ? "1 set" : `${count} sets`;
}

/** Below the title of the finish page: "2 of 3 exercises have sets" */
export function exercisesWithSetsText(done: number, total: number): string {
  return `${done} of ${total} ${total === 1 ? "exercise has" : "exercises have"} sets`;
}

/** One set is always left, a unilateral set has an entry per side (EditWorkoutExerciseView.canRemoveSet) */
export function canRemoveSet(workoutExercise: SetArrays & Pick<WorkoutExercise, "unilateral">): boolean {
  return entryCount(workoutExercise) > (workoutExercise.unilateral ? 2 : 1);
}
