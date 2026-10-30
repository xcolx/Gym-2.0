"use client";

import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleArrowRight, Pencil, RotateCcw, Trash } from "lucide-react";

import { HighlightedBody } from "@/components/ui/HighlightedBody";
import { Alert } from "@/components/ui/Alert";
import { ShareTextButton } from "@/components/stats/ShareTextButton";
import { StatRows } from "@/components/stats/StatRows";
import { Page, PageHeader } from "@/components/ui/Page";
import { pastWorkoutShareText, pastWorkoutSummaryLines } from "@/lib/domain/stats-screens";
import { musclesTrainedInWorkout } from "@/lib/domain/workout";

import { PastWorkoutExerciseList } from "./PastWorkoutExerciseList";
import { usePastWorkoutDetail } from "./use-past-workout-detail";

/** Port of PastWorkoutDetailView.swift with PastWorkoutDetailViewModel.swift */
export function PastWorkoutDetailScreen({ workoutId }: { workoutId: string }) {
  const { workout, reference, settings, leaving, alert, showAlert, closeAlert, onContinue, onRepeat, onDelete } =
    usePastWorkoutDetail(workoutId);

  if (leaving || workout === undefined || reference === undefined || settings === undefined) return null;
  if (workout === null) notFound();

  const [primary, secondary] = musclesTrainedInWorkout(workout, reference);

  return (
    <Page>
      <PageHeader
        title={workout.name}
        back={{ href: "/stats/past-workouts", label: "Past Workouts" }}
        trailing={
          <>
            <button
              type="button"
              aria-label="Continue Workout"
              className="active:opacity-50"
              onClick={() => showAlert("continue")}
            >
              <CircleArrowRight size={22} strokeWidth={2.25} />
            </button>
            <button
              type="button"
              aria-label="Repeat Workout"
              className="active:opacity-50"
              onClick={() => void onRepeat()}
            >
              <RotateCcw size={22} strokeWidth={2.25} />
            </button>
            <ShareTextButton text={() => pastWorkoutShareText(workout, settings)} label="Share Workout" />
            <Link
              href={`/stats/past-workouts/${workout.id}/edit`}
              aria-label="Edit Workout"
              className="active:opacity-50"
            >
              <Pencil size={22} strokeWidth={2.25} />
            </Link>
            <button
              type="button"
              aria-label="Delete Workout"
              className="text-[#ff3b30] active:opacity-50"
              onClick={() => showAlert("delete")}
            >
              <Trash size={22} strokeWidth={2.25} />
            </button>
          </>
        }
      />

      <HighlightedBody primaryMuscles={primary} secondaryMuscles={secondary} className="mx-auto h-[38dvh] max-w-full" />

      <StatRows lines={pastWorkoutSummaryLines(workout, settings)} className="px-2.5 py-0.5" />

      <PastWorkoutExerciseList workout={workout} settings={settings} />

      <Alert
        open={alert === "delete"}
        title="Are you sure you want to delete this workout?"
        message="If you delete this workout all of the progress you made will be deleted from the statistics as well."
        buttons={[
          { label: "Go back", role: "cancel" },
          { label: "Delete", role: "destructive", onSelect: () => void onDelete() },
        ]}
        onClose={closeAlert}
      />
      <Alert
        open={alert === "continue"}
        title="Are you sure you want to continue with this workout?"
        message="You can continue with this workout if you accidentally ended it."
        buttons={[
          { label: "Cancel", role: "cancel" },
          { label: "Continue", onSelect: () => void onContinue() },
        ]}
        onClose={closeAlert}
      />
      <Alert
        open={alert === "notContinue"}
        title="Error"
        message="You cannot continue a workout if another workout is already in progress."
        buttons={[{ label: "OK", role: "cancel" }]}
        onClose={closeAlert}
      />
      <Alert
        open={alert === "notRepeat"}
        title="Error"
        message="You cannot repeat a workout if another workout is already in progress."
        buttons={[{ label: "OK", role: "cancel" }]}
        onClose={closeAlert}
      />
    </Page>
  );
}
