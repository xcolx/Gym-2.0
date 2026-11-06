"use client";

import { notFound, useRouter } from "next/navigation";
import { Ellipsis, Pencil, Play, RotateCcw, Trash } from "lucide-react";

import { HighlightedBody } from "@/components/ui/HighlightedBody";
import { Alert } from "@/components/ui/Alert";
import { ShareTextButton } from "@/components/stats/ShareTextButton";
import { Menu } from "@/components/ui/Menu";
import { Page, PageHeader } from "@/components/ui/Page";
import { BottomActionBar, PrimaryButton } from "@/components/ui/PrimaryButton";
import { appLocale } from "@/lib/domain/format";
import { pastWorkoutShareText, pastWorkoutSummaryLines } from "@/lib/domain/stats-screens";
import { musclesTrainedInWorkout } from "@/lib/domain/workout";

import { PastWorkoutExerciseList } from "./PastWorkoutExerciseList";
import { usePastWorkoutDetail } from "./use-past-workout-detail";

/**
 * Port of PastWorkoutDetailView.swift with PastWorkoutDetailViewModel.swift: the date, the trained muscles with the
 * totals of the workout, its exercises and the button to repeat it
 */
export function PastWorkoutDetailScreen({ workoutId }: { workoutId: string }) {
  const router = useRouter();
  const { workout, reference, settings, leaving, alert, showAlert, closeAlert, onContinue, onRepeat, onDelete } =
    usePastWorkoutDetail(workoutId);

  if (leaving || workout === undefined || reference === undefined || settings === undefined) return null;
  if (workout === null) notFound();

  const [primary, secondary] = musclesTrainedInWorkout(workout, reference);
  const date = workout.date.toLocaleString(appLocale(), {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Page className="bg-grouped">
      <PageHeader
        title={workout.name}
        back={{ href: "/stats/past-workouts", label: "Past workouts" }}
        trailing={
          <>
            <ShareTextButton text={() => pastWorkoutShareText(workout, settings)} label="Share workout" />
            <Menu
              label="More"
              items={[
                { label: "Continue workout", icon: Play, onSelect: () => showAlert("continue") },
                { label: "Edit workout", icon: Pencil, onSelect: () => router.push(`/stats/past-workouts/${workout.id}/edit`) },
                { label: "Delete workout", icon: Trash, destructive: true, onSelect: () => showAlert("delete") },
              ]}
            >
              <Ellipsis size={24} />
            </Menu>
          </>
        }
      />

      <div className="flex flex-col gap-4 px-4 pb-4">
        <p className="px-1 text-subheadline text-secondary-label">{date}</p>

        {/* The body with the totals of the workout next to it */}
        <div className="card flex items-center gap-4 p-4">
          <HighlightedBody primaryMuscles={primary} secondaryMuscles={secondary} className="w-[130px] shrink-0" />
          <dl className="grid min-w-0 flex-1 grid-cols-2 gap-x-3 gap-y-3.5">
            {pastWorkoutSummaryLines(workout, settings)
              .filter((line) => line.title !== "Date")
              .map((line) => (
                <div key={line.title} className="flex min-w-0 flex-col gap-0.5">
                  <dt className="truncate text-caption1 text-secondary-label">{line.title}</dt>
                  <dd className="truncate font-rounded text-headline font-semibold">{line.value}</dd>
                </div>
              ))}
          </dl>
        </div>

        <PastWorkoutExerciseList workout={workout} settings={settings} />
      </div>

      <BottomActionBar>
        <PrimaryButton onClick={() => void onRepeat()} className="min-h-[50px]">
          <RotateCcw size={19} strokeWidth={2.5} className="mr-2" aria-hidden />
          Repeat workout
        </PrimaryButton>
      </BottomActionBar>

      <Alert
        open={alert === "delete"}
        title="Delete this workout?"
        message="If you delete this workout all of the progress you made will be deleted from the statistics as well."
        buttons={[
          { label: "Delete", role: "destructive", onSelect: () => void onDelete() },
          { label: "Cancel", role: "cancel" },
        ]}
        onClose={closeAlert}
      />
      <Alert
        open={alert === "continue"}
        title="Continue this workout?"
        message="You can continue with this workout if you accidentally ended it."
        buttons={[
          { label: "Continue", onSelect: () => void onContinue() },
          { label: "Cancel", role: "cancel" },
        ]}
        onClose={closeAlert}
      />
      <Alert
        open={alert === "notContinue"}
        title="Can't continue this workout"
        message="You cannot continue a workout if another workout is already in progress."
        buttons={[{ label: "OK", role: "cancel" }]}
        onClose={closeAlert}
      />
      <Alert
        open={alert === "notRepeat"}
        title="Can't repeat this workout"
        message="You cannot repeat a workout if another workout is already in progress."
        buttons={[{ label: "OK", role: "cancel" }]}
        onClose={closeAlert}
      />
    </Page>
  );
}
