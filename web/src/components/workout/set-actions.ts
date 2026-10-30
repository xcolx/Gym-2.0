// In the performing workout the changes are stored right away, while a past workout is edited they change its draft,
// which is only stored on "Save".

import { addSet, removeLastSet, setSetValue, setUnilateral } from "@/lib/repo";
import type { LocalId, SetMetric } from "@/types/models";

export interface SetActions {
  addSet(workoutExerciseId: LocalId): void;
  removeLastSet(workoutExerciseId: LocalId): void;
  /** In the stored unit (kg, m, s) */
  setValue(workoutExerciseId: LocalId, metric: SetMetric, entryIndex: number, value: number): void;
  setUnilateral(workoutExerciseId: LocalId, unilateral: boolean): void;
}

/** Stores every change right away */
export const storedSetActions: SetActions = {
  addSet: (id) => void addSet(id),
  removeLastSet: (id) => void removeLastSet(id),
  setValue: (id, metric, entryIndex, value) => void setSetValue(id, metric, entryIndex, value),
  setUnilateral: (id, unilateral) => void setUnilateral(id, unilateral),
};
