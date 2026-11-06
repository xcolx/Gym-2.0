"use client";

// Port of ios/Gym 2.0/Features/Workout/ActiveWorkout/DeleteWorkoutConfirmation.swift

import { useState } from "react";

import { Alert } from "@/components/ui/Alert";

/**
 * Asks twice before the workout in progress is deleted: first whether to continue it or delete it, then whether the
 * user is sure, since it can't be reverted
 */
export function DeleteWorkoutConfirmation({ open, onClose, onDelete }: { open: boolean; onClose: () => void; onDelete: () => void }) {
  const [asksAgain, setAsksAgain] = useState(false);
  return (
    <>
      <Alert
        open={open}
        title="Cancel this workout?"
        message="You can continue it, or delete it with all its sets."
        buttons={[
          { label: "Continue workout", role: "cancel" },
          { label: "Delete workout", role: "destructive", onSelect: () => setAsksAgain(true) },
        ]}
        onClose={onClose}
      />
      <Alert
        open={asksAgain}
        title="Are you sure?"
        message="The workout is deleted. This can't be reverted."
        buttons={[
          { label: "Go back", role: "cancel" },
          { label: "Delete", role: "destructive", onSelect: onDelete },
        ]}
        onClose={() => setAsksAgain(false)}
      />
    </>
  );
}
