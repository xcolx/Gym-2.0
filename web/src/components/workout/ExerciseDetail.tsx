"use client";

// Port of ios/Gym 2.0/Features/Workout/Exercises/ExerciseDetailView.swift

import { useEffect, useState } from "react";
import { ChevronLeft, CircleCheck, CirclePlus, Image as ImageIcon, Pencil } from "lucide-react";

import { HighlightedBody } from "@/components/ui/HighlightedBody";
import {
  exerciseCanEdit,
  exerciseEquipment,
  exerciseMuscleGroup,
  exercisePrimaryMuscles,
  exerciseSecondaryMuscles,
  exerciseTrackedMetrics,
} from "@/lib/domain/exercise";
import { SET_METRIC_NAMES } from "@/lib/domain/set-metric";
import { useExercise, useReferenceData } from "@/lib/repo/hooks";
import type { Exercise, LocalId } from "@/types/models";
import { CreateExercise } from "./CreateExercise";
import { ExerciseImages, exerciseImageItems } from "./exercise-image";

export function ExerciseDetail({
  exerciseId,
  backLabel,
  onBack,
  onAdd,
}: {
  exerciseId: LocalId;
  backLabel: string;
  onBack: () => void;
  /** Without it there is no plus, e.g. in the performing workout, where the exercise is already part of it */
  onAdd?: (exercise: Exercise) => void;
}) {
  const exercise = useExercise(exerciseId);
  const reference = useReferenceData();
  const [editing, setEditing] = useState(false);

  // deleted, also on another device: back to the list
  useEffect(() => {
    if (exercise === null) onBack();
  }, [exercise, onBack]);

  if (!exercise) return null;

  const primaryMuscles = reference ? exercisePrimaryMuscles(exercise, reference) : [];
  const secondaryMuscles = reference ? exerciseSecondaryMuscles(exercise, reference) : [];
  const description = exercise.exerciseDescription;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0">
        <div className="flex h-11 items-center justify-between px-2">
          <button type="button" onClick={onBack} className="flex h-11 items-center pr-2 text-body text-app active:opacity-50">
            <ChevronLeft size={30} strokeWidth={2.25} className="-mr-0.5" />
            {backLabel}
          </button>
          <div className="flex items-center gap-1 pr-1">
            {/* verified exercises can't be changed */}
            {exerciseCanEdit(exercise) && (
              <button
                type="button"
                aria-label="Edit exercise"
                onClick={() => setEditing(true)}
                className="flex h-11 w-11 items-center justify-center text-my-black active:opacity-50"
              >
                <Pencil size={26} />
              </button>
            )}
            {onAdd && (
              <button
                type="button"
                aria-label="Add exercise"
                onClick={() => onAdd(exercise)}
                className="flex h-11 w-11 items-center justify-center text-[#34c759] active:opacity-50"
              >
                <CirclePlus size={30} />
              </button>
            )}
          </div>
        </div>
        <h1 className="break-words px-4 pb-2 text-large-title font-bold tracking-tight">{exercise.name}</h1>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {/* Same icon as in the exercise list */}
        {exercise.verified && (
          <p className="flex items-center gap-1.5 px-2.5 text-[15px] text-[#007aff]">
            <CircleCheck size={17} />
            Verified Exercise
          </p>
        )}

        <div className="mt-1 grid grid-cols-2 gap-2 px-2.5">
          <div className="aspect-square overflow-y-auto bg-field/40 p-[5px]">
            {description ? <p className="whitespace-pre-wrap break-words">{description}</p> : <p>No description was added :(</p>}
          </div>
          <div className="aspect-square overflow-hidden bg-black">
            <ExerciseImages
              images={exerciseImageItems(exercise.imageUrls, exercise.pendingImages)}
              placeholder={<ImageIcon size={40} className="text-white" />}
            />
          </div>
        </div>

        <p className="px-2.5 py-[5px]">
          <span className="font-semibold">Tracked per Set: </span>
          {exerciseTrackedMetrics(exercise)
            .map((metric) => SET_METRIC_NAMES[metric])
            .join(", ")}
        </p>

        <div className="flex gap-2 pr-2.5">
          <HighlightedBody className="w-1/2 shrink-0" primaryMuscles={primaryMuscles} secondaryMuscles={secondaryMuscles} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Primary Muscles</p>
            {primaryMuscles.map((muscle) => (
              <p key={muscle.serverId}>{muscle.name}</p>
            ))}
            <p className="mt-2 font-semibold">Secondary Muscles</p>
            {secondaryMuscles.map((muscle) => (
              <p key={muscle.serverId}>{muscle.name}</p>
            ))}
            <p className="mt-2 font-semibold">Muscle Group</p>
            <p className="pb-2.5">{reference ? (exerciseMuscleGroup(exercise, reference)?.name ?? "") : ""}</p>
            <p className="font-semibold">Equipment</p>
            <p className="pb-5">{reference ? (exerciseEquipment(exercise, reference)?.name ?? "") : ""}</p>
          </div>
        </div>
      </div>

      <CreateExercise open={editing} exercise={exercise} onClose={() => setEditing(false)} onDeleted={onBack} />
    </div>
  );
}
