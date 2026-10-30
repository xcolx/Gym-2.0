"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { EditWorkout } from "@/components/workout/EditWorkout";
import { PillButton } from "@/components/ui/Page";
import { createScheme } from "@/lib/repo";
import type { Exercise } from "@/types/models";

/** Port of AddSchemeWorkoutView.swift */
export default function AddSchemePage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [list, setList] = useState<Exercise[]>([]);
  // The server needs a name
  const name = title.trim();

  const save = async () => {
    await createScheme(name, list.map((e) => e.id));
    router.replace("/workout");
  };

  return (
    <EditWorkout
      navTitle="Add Workout Scheme"
      back={{ href: "/workout", label: "Workout" }}
      workoutTitle={title}
      onWorkoutTitleChange={setTitle}
      exerciseList={list}
      onExerciseListChange={setList}
    >
      <PillButton onClick={() => void save()} disabled={name === ""}>
        Save Workout
      </PillButton>
    </EditWorkout>
  );
}
