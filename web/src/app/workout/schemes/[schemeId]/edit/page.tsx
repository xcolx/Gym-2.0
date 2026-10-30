"use client";

import { notFound, useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";

import { EditWorkout } from "@/components/workout/EditWorkout";
import { PillButton } from "@/components/ui/Page";
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
  // A local copy of the name and list, so nothing is saved before "Save Workout"
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
      navTitle={`Edit: ${scheme.name}`}
      back={{ href: "/workout", label: "Workout" }}
      workoutTitle={title}
      onWorkoutTitleChange={setTitle}
      exerciseList={list}
      onExerciseListChange={setList}
    >
      <div className="grid w-full grid-cols-[2fr_auto_1fr] items-center px-2.5">
        <span />
        <PillButton onClick={() => void save()} disabled={name === ""}>
          Save Workout
        </PillButton>
        <div className="flex justify-center">
          <button
            type="button"
            aria-label="Delete workout"
            onClick={() => setAsksToDelete(true)}
            className="rounded-full border-2 border-[#ff3b30] p-[15px] text-[#ff3b30] active:opacity-60"
          >
            <Trash2 size={26} />
          </button>
        </div>
      </div>
      <Alert
        open={asksToDelete}
        title="Are you sure you want to delete this workout?"
        message="There is no way to recover it."
        buttons={[
          { label: "Delete", role: "destructive", onSelect: () => void remove() },
          { label: "Go back", role: "cancel" },
        ]}
        onClose={() => setAsksToDelete(false)}
      />
    </EditWorkout>
  );
}
