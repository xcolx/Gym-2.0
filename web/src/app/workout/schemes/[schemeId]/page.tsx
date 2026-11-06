"use client";

import { notFound, useParams } from "next/navigation";
import { useState } from "react";

import { EditWorkout, StartLabel } from "@/components/workout/EditWorkout";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { Alert } from "@/components/ui/Alert";
import { InProgressWorkoutChooser } from "@/components/workout/InProgressWorkoutChooser";
import { useStartWorkout } from "@/components/workout/start-workout";
import { startWorkoutFromScheme, updateScheme } from "@/lib/repo";
import { useScheme } from "@/lib/repo/hooks";
import type { WorkoutSchemeWithExercises } from "@/types/models";

/** Port of SchemeWorkoutView.swift */
export default function SchemePage() {
  const { schemeId } = useParams<{ schemeId: string }>();
  const scheme = useScheme(schemeId);

  if (scheme === undefined) return null;
  if (scheme === null) notFound();
  return <SchemeWorkout key={scheme.id} scheme={scheme} />;
}

function SchemeWorkout({ scheme }: { scheme: WorkoutSchemeWithExercises }) {
  // A local copy of the name and list, so the scheme isn't changed by starting a workout
  const [title, setTitle] = useState(scheme.name);
  const [list, setList] = useState(scheme.exercises);
  const [asksToSave, setAsksToSave] = useState(false);
  const { start, open, chooser } = useStartWorkout();

  // The server needs a name, an emptied field keeps the name of the scheme
  const name = title.trim() || scheme.name;
  const exerciseIds = list.map((e) => e.id);
  const changed =
    scheme.name !== title ||
    scheme.exercises.length !== list.length ||
    scheme.exercises.some((exercise, index) => exercise.id !== list[index].id);

  const begin = async (saveForFuture: boolean) => {
    if (saveForFuture) await updateScheme(scheme.id, name, exerciseIds);
    open(await startWorkoutFromScheme(scheme.id, name, exerciseIds));
  };

  return (
    <EditWorkout
      navTitle={scheme.name}
      back={{ href: "/workout", label: "Workout" }}
      workoutTitle={title}
      onWorkoutTitleChange={setTitle}
      exerciseList={list}
      onExerciseListChange={setList}
    >
      <PrimaryButton
        disabled={list.length === 0}
        onClick={() =>
          void start(async () => {
            // the changes can be kept for the future or only for this workout
            if (changed) {
              setAsksToSave(true);
              return null;
            }
            return startWorkoutFromScheme(scheme.id, name, exerciseIds);
          })
        }
      >
        <StartLabel />
      </PrimaryButton>
      <InProgressWorkoutChooser {...chooser} />
      <Alert
        open={asksToSave}
        title="Do you want to save these changes for future use?"
        message="Otherwise it's only changed for this time."
        buttons={[
          { label: "Just once", role: "cancel", onSelect: () => void begin(false) },
          { label: "Save for the future", onSelect: () => void begin(true) },
        ]}
        onClose={() => setAsksToSave(false)}
      />
    </EditWorkout>
  );
}
