"use client";

import { useParams } from "next/navigation";

import { ActiveWorkoutScreen } from "@/components/workout/active/ActiveWorkoutScreen";

/** Port of WhilstWorkoutView.swift */
export default function ActiveWorkoutPage() {
  const { workoutId } = useParams<{ workoutId: string }>();
  return <ActiveWorkoutScreen workoutId={workoutId} />;
}
