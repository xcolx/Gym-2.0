"use client";

import { useParams } from "next/navigation";
import { useState } from "react";

import { EditWorkout } from "@/components/workout/EditWorkout";
import { PillButton } from "@/components/ui/Page";
import { InProgressWorkoutChooser } from "@/components/workout/InProgressWorkoutChooser";
import { useStartWorkout } from "@/components/workout/start-workout";
import { startWorkout } from "@/lib/repo";
import { useExerciseMap } from "@/lib/repo/hooks";
import type { Exercise, LocalId } from "@/types/models";

const DEFAULT_SUGGESTED_WORKOUT_NAME = "Suggested Workout";

/**
 * Port of SuggestedWorkoutView.swift. The suggestion id is the "+"-joined list of local exercise ids, so the page
 * survives reloads.
 */
export default function SuggestedWorkoutPage() {
  const { suggestionId } = useParams<{ suggestionId: string }>();
  const exercises = useExerciseMap();

  if (!exercises) return null;
  const list = decodeURIComponent(suggestionId)
    .split("+")
    .flatMap((id: LocalId) => exercises.get(id) ?? []);
  return <SuggestedWorkout key={suggestionId} initialList={list} />;
}

function SuggestedWorkout({ initialList }: { initialList: Exercise[] }) {
  const [title, setTitle] = useState("");
  const [list, setList] = useState(initialList);
  const { start, chooser } = useStartWorkout();

  return (
    <EditWorkout
      navTitle="Suggested Workout"
      back={{ href: "/workout/suggested/settings", label: "Back" }}
      workoutTitle={title}
      onWorkoutTitleChange={setTitle}
      exerciseList={list}
      onExerciseListChange={setList}
    >
      <PillButton
        onClick={() => void start(() => startWorkout(title.trim() || DEFAULT_SUGGESTED_WORKOUT_NAME, list.map((e) => e.id)))}
      >
        Start Workout
      </PillButton>
      <InProgressWorkoutChooser {...chooser} />
    </EditWorkout>
  );
}
