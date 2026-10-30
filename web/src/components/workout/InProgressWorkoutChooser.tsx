"use client";

// Port of ios/Gym 2.0/Features/Workout/InProgressWorkoutChooser.swift

import { formatDate, timeFromDate } from "@/lib/domain/format";
import { useWorkoutsInProgress } from "@/lib/repo/hooks";
import type { Workout } from "@/types/models";
import { Alert } from "@/components/ui/Alert";

export function InProgressWorkoutChooser({
  open,
  title,
  message,
  onOpen,
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  onOpen: (workout: Workout) => void;
  onClose: () => void;
}) {
  const workouts = useWorkoutsInProgress() ?? [];
  const buttons =
    workouts.length === 1
      ? [{ label: "Open it", onSelect: () => onOpen(workouts[0]) }]
      : workouts.map((workout) => ({
          label: `${workout.name}, ${formatDate(workout.date)} ${timeFromDate(workout.date)}`,
          onSelect: () => onOpen(workout),
        }));
  return (
    <Alert
      open={open}
      title={title}
      message={message}
      buttons={[...buttons, { label: "Cancel", role: "cancel" }]}
      onClose={onClose}
    />
  );
}
