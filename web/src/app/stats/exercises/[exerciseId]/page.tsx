"use client";

import { notFound, useParams } from "next/navigation";

import { StatRows } from "@/components/stats/StatRows";
import { Page, PageHeader } from "@/components/ui/Page";
import { formatDate } from "@/lib/domain/format";
import { entryDescriptions, exerciseStatsLines } from "@/lib/domain/stats-screens";
import { useExerciseHistory } from "@/lib/repo";
import { useExercise, useUserSettings } from "@/lib/repo/hooks";

/** Port of ExercisesStatsDetailView.swift */
export default function ExerciseStatsDetailPage() {
  const { exerciseId } = useParams<{ exerciseId: string }>();
  const exercise = useExercise(exerciseId);
  const history = useExerciseHistory(exerciseId);
  const settings = useUserSettings();

  if (exercise === undefined || history === undefined || settings === undefined) return null;
  if (exercise === null) notFound();

  return (
    <Page>
      <PageHeader title={exercise.name} back={{ href: "/stats/exercises", label: "Stats by Exercise" }} />
      <StatRows lines={exerciseStatsLines(exercise, history, settings)} className="px-2.5" />

      <p className="mt-2 pl-2.5">History:</p>
      <div className="mx-2.5 mb-2.5 rounded-[10px] border-2 border-foreground px-0.5 py-2.5">
        {history.length === 0 ? (
          <p className="px-4 py-[11px]">
            You have never done this exercise. You will see your past workouts with this exercise here.
          </p>
        ) : (
          <ul>
            {history.map((entry) => (
              <li
                key={entry.id}
                className="mx-4 flex items-start gap-2 border-b border-separator py-[11px] last:border-b-0"
              >
                <span className="shrink-0">{formatDate(entry.workout.date)}</span>
                <span className="flex-1" />
                <span className="min-w-0 break-words text-center">{entry.workout.name}</span>
                <span className="flex-1" />
                <span className="flex shrink-0 flex-col items-end">
                  {entryDescriptions(entry, settings).map((description, index) => (
                    <span key={index}>{description}</span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Page>
  );
}
