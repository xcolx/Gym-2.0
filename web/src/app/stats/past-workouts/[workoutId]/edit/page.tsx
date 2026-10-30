"use client";

import { useParams } from "next/navigation";

import { EditPastWorkoutScreen } from "@/components/stats/past-workout/EditPastWorkoutScreen";

/** Port of EditPastWorkoutView.swift */
export default function EditPastWorkoutPage() {
  const { workoutId } = useParams<{ workoutId: string }>();
  return <EditPastWorkoutScreen workoutId={workoutId} />;
}
