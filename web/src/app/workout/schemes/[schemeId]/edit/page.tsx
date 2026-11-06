"use client";

import { notFound, useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";

import { PrimaryButton } from "@/components/ui/PrimaryButton";

import { EditWorkout, SaveLabel, SquareActionButton } from "@/components/workout/EditWorkout";
import { Alert } from "@/components/ui/Alert";
import { deleteScheme, updateScheme } from "@/lib/repo";
import { useScheme } from "@/lib/repo/hooks";
import type { WorkoutSchemeWithExercises } from "@/types/models";

/** Port of EditSchemeWorkoutView.swift */
export default function EditSchemePage() {
  const { schemeId } = useParams<{ schemeId: string }>();
  const scheme = useScheme(schemeId);
  // deleted here, the page is left right after
  const [deleting, setDeleting] = useState(false);

  if (scheme === undefined || (scheme === null && deleting)) return null;
  if (scheme === null) notFound();
  // Keyed, so the local copy starts again from the stored scheme when another one is opened
  return <EditScheme key={scheme.id} scheme={scheme} onDelete={() => setDeleting(true)} />;
}

function EditScheme({ scheme, onDelete }: { scheme: WorkoutSchemeWithExercises; onDelete: () => void }) {
  const router = useRouter();
  // A local copy of the name and list, so nothing is saved before "Save workout"
  const [title, setTitle] = useState(scheme.name);
  const [list, setList] = useState(scheme.exercises);
  const [asksToDelete, setAsksToDelete] = useState(false);
  // The server needs a name
  const name = title.trim();

  const save = async () => {
    await updateScheme(scheme.id, name, list.map((e) => e.id));
    router.replace("/workout");
  };

  const remove = async () => {
    onDelete();
    await deleteScheme(scheme.id);
    router.replace("/workout");
  };

  return (
    <EditWorkout
      navTitle="Edit workout"
      back={{ href: "/workout", label: "Workout" }}
      workoutTitle={title}
      onWorkoutTitleChange={setTitle}
      exerciseList={list}
      onExerciseListChange={setList}
    >
      <SquareActionButton label="Delete workout" destructive onClick={() => setAsksToDelete(true)}>
        <Trash2 size={21} aria-hidden />
      </SquareActionButton>
      <PrimaryButton onClick={() => void save()} disabled={name === "" || list.length === 0}>
        <SaveLabel />
      </PrimaryButton>
      <Alert
        open={asksToDelete}
        title="Delete this workout?"
        message="It can't be recovered."
        buttons={[
          { label: "Delete", role: "destructive", onSelect: () => void remove() },
          { label: "Cancel", role: "cancel" },
        ]}
        onClose={() => setAsksToDelete(false)}
      />
    </EditWorkout>
  );
}
