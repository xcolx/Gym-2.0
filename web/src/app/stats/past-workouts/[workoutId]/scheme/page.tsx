"use client";

import { notFound, useParams, useRouter } from "next/navigation";

import { AddScheme } from "@/components/workout/AddScheme";
import { goBack } from "@/lib/navigation";
import { useWorkout } from "@/lib/repo/hooks";

/**
 * A new workout scheme prefilled with the name and the exercises of a past workout, in the order they were done (the
 * AddSchemeWorkoutView that PastWorkoutDetailView.swift shows as a sheet). Deleted exercises are left out. Saving or
 * going back returns to the past workout. The past workout id is in the path, so the page survives reloads.
 */
export default function SchemeFromPastWorkoutPage() {
  const router = useRouter();
  const { workoutId } = useParams<{ workoutId: string }>();
  const workout = useWorkout(workoutId);

  if (workout === undefined) return null;
  if (workout === null) notFound();

  const parent = `/stats/past-workouts/${workout.id}`;
  const list = workout.workoutExercises.flatMap((workoutExercise) => workoutExercise.exercise ?? []);
  return (
    <AddScheme
      key={workoutId}
      back={{ href: parent, label: workout.name }}
      onSaved={() => goBack(router, parent)}
      initialTitle={workout.name}
      initialList={list}
    />
  );
}
