"use client";

import { useState } from "react";

import { EditWorkout, SaveLabel } from "@/components/workout/EditWorkout";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { createScheme } from "@/lib/repo";
import type { Exercise } from "@/types/models";

/** Port of AddSchemeWorkoutView.swift, empty or prefilled with the name and exercises of a past workout */
export function AddScheme({
  back,
  onSaved,
  initialTitle = "",
  initialList = [],
}: {
  back: { href: string; label: string };
  /** Leaves the screen after the scheme was created */
  onSaved: () => void;
  initialTitle?: string;
  initialList?: Exercise[];
}) {
  const [title, setTitle] = useState(initialTitle);
  const [list, setList] = useState(initialList);
  // The server needs a name
  const name = title.trim();

  const save = async () => {
    await createScheme(name, list.map((e) => e.id));
    onSaved();
  };

  return (
    <EditWorkout
      navTitle="New workout"
      back={back}
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
