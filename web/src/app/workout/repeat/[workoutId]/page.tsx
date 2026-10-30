"use client";

import { notFound, useParams } from "next/navigation";

import { FreeWorkout } from "@/components/workout/FreeWorkout";
import { useWorkout } from "@/lib/repo/hooks";

/**
 * The free workout prefilled with the name and the exercises of a past workout, in the order they were done (the
 * `.repeatedWorkout` destination of WorkoutView.swift). Deleted exercises are left out. The past workout id is in the
 * path, so the page survives reloads.
 */
export default function RepeatWorkoutPage() {
  const { workoutId } = useParams<{ workoutId: string }>();
  const workout = useWorkout(workoutId);

  if (workout === undefined) return null;
  if (workout === null) notFound();

  const list = workout.workoutExercises.flatMap((workoutExercise) => workoutExercise.exercise ?? []);
  return <FreeWorkout key={workoutId} initialTitle={workout.name} initialList={list} />;
}
