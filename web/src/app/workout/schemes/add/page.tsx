"use client";

import { useRouter } from "next/navigation";

import { AddScheme } from "@/components/workout/AddScheme";

/** Port of AddSchemeWorkoutView.swift */
export default function AddSchemePage() {
  const router = useRouter();
  return <AddScheme back={{ href: "/workout", label: "Workout" }} onSaved={() => router.replace("/workout")} />;
}
