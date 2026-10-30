"use client";

import { useState } from "react";

import { EditWorkout } from "@/components/workout/EditWorkout";
import { PillButton } from "@/components/ui/Page";
import { InProgressWorkoutChooser } from "@/components/workout/InProgressWorkoutChooser";
import { useStartWorkout } from "@/components/workout/start-workout";
import { DEFAULT_FREE_WORKOUT_NAME } from "@/lib/domain/workout";
import { startWorkout } from "@/lib/repo";
import type { Exercise } from "@/types/models";

/** Port of FreeWorkoutView.swift, empty or prefilled with the name and exercises of a repeated past workout */
export function FreeWorkout({
  initialTitle = "",
  initialList = [],
}: {
  initialTitle?: string;
  initialList?: Exercise[];
}) {
  const [title, setTitle] = useState(initialTitle);
  const [list, setList] = useState(initialList);
  const { start, chooser } = useStartWorkout();

  return (
    <EditWorkout
      navTitle="Free Workout"
      back={{ href: "/workout", label: "Workout" }}
      workoutTitle={title}
      onWorkoutTitleChange={setTitle}
      exerciseList={list}
      onExerciseListChange={setList}
    >
      <PillButton
        onClick={() =>
          // without a name it is called "Free Workout"
          void start(() => startWorkout(title.trim() || DEFAULT_FREE_WORKOUT_NAME, list.map((e) => e.id)))
        }
      >
        Start Workout
      </PillButton>
      <InProgressWorkoutChooser {...chooser} />
    </EditWorkout>
  );
}
