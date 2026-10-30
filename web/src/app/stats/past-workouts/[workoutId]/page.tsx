"use client";

import { useParams } from "next/navigation";

import { PastWorkoutDetailScreen } from "@/components/stats/past-workout/PastWorkoutDetailScreen";

/** Port of PastWorkoutDetailView.swift */
export default function PastWorkoutDetailPage() {
  const { workoutId } = useParams<{ workoutId: string }>();
  return <PastWorkoutDetailScreen workoutId={workoutId} />;
}
