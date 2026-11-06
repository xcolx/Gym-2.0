"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Shuffle } from "lucide-react";
import { Suspense, useState } from "react";

import { EditWorkout, SquareActionButton, StartLabel } from "@/components/workout/EditWorkout";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { InProgressWorkoutChooser } from "@/components/workout/InProgressWorkoutChooser";
import { useStartWorkout } from "@/components/workout/start-workout";
import { suggestionExerciseIds, suggestionRoute, suggestionSettings, useSuggestWorkout } from "@/components/workout/suggest-workout";
import { startWorkout } from "@/lib/repo";
import { useExerciseMap } from "@/lib/repo/hooks";
import type { Exercise, LocalId } from "@/types/models";

const DEFAULT_SUGGESTED_WORKOUT_NAME = "Suggested workout";

/**
 * Port of SuggestedWorkoutView.swift. The query has the local ids of the exercises and the settings (suggestionRoute),
 * so the page survives reloads and can be shuffled.
 */
export default function SuggestedWorkoutPage() {
  // useSearchParams needs a boundary, the page is prerendered without a query
  return (
    <Suspense>
      <SuggestedWorkoutFromQuery />
    </Suspense>
  );
}

function SuggestedWorkoutFromQuery() {
  const query = useSearchParams();
  const exercises = useExerciseMap();

  if (!exercises) return null;
  // the list of the query when the page opens, later only the state of SuggestedWorkout
  const list = suggestionExerciseIds(query).flatMap((id: LocalId) => exercises.get(id) ?? []);
  return <SuggestedWorkout initialList={list} />;
}

function SuggestedWorkout({ initialList }: { initialList: Exercise[] }) {
  const router = useRouter();
  const settings = suggestionSettings(useSearchParams());
  const suggest = useSuggestWorkout();
  const [title, setTitle] = useState("");
  const [list, setList] = useState(initialList);
  const { start, chooser } = useStartWorkout();

  const shuffle = () => {
    if (!settings || !suggest) return;
    const shuffled = suggest(settings);
    setList(shuffled);
    // kept for a reload, without a new history entry
    router.replace(suggestionRoute(shuffled, settings), { scroll: false });
  };

  return (
    <EditWorkout
      navTitle="Suggested workout"
      back={{ href: "/workout/suggested/settings", label: "Back" }}
      workoutTitle={title}
      onWorkoutTitleChange={setTitle}
      exerciseList={list}
      onExerciseListChange={setList}
    >
      {settings && (
        <SquareActionButton label="Shuffle" onClick={shuffle}>
          <Shuffle size={21} aria-hidden />
        </SquareActionButton>
      )}
      <PrimaryButton
        disabled={list.length === 0}
        onClick={() => void start(() => startWorkout(title.trim() || DEFAULT_SUGGESTED_WORKOUT_NAME, list.map((e) => e.id)))}
      >
        <StartLabel />
      </PrimaryButton>
      <InProgressWorkoutChooser {...chooser} />
    </EditWorkout>
  );
}
