"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { EditWorkout, SaveLabel } from "@/components/workout/EditWorkout";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
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
      navTitle="New workout"
      back={{ href: "/workout", label: "Workout" }}
      workoutTitle={title}
      onWorkoutTitleChange={setTitle}
      exerciseList={list}
      onExerciseListChange={setList}
    >
      <PrimaryButton onClick={() => void save()} disabled={name === "" || list.length === 0}>
        <SaveLabel />
      </PrimaryButton>
    </EditWorkout>
  );
}
