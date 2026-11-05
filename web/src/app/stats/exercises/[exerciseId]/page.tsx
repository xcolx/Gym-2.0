"use client";

import { Dumbbell, Trophy } from "lucide-react";
import { notFound, useParams } from "next/navigation";
import { useState } from "react";

import { ExerciseHistoryCard } from "@/components/stats/ExerciseHistoryCard";
import { ProgressChart } from "@/components/stats/ProgressChart";
import { StatsSectionHeader, ValueTiles } from "@/components/stats/StatTiles";
import { AppColorSegmentedPicker } from "@/components/ui/AppColorSegmentedPicker";
import { ContentUnavailable } from "@/components/ui/ContentUnavailable";
import { Page, PageHeader } from "@/components/ui/Page";
import { formatDate } from "@/lib/domain/format";
import { formatRecord, summaryOfWorkoutExercises } from "@/lib/domain/stats";
import {
  CHART_METRIC_TITLES,
  CHART_RANGES,
  chartMetrics,
  chartRangeStart,
  chartUnit,
  chartValue,
  personalRecordSet,
  type ExerciseChartMetric,
  type ExerciseChartRange,
} from "@/lib/domain/stats-overview";
import { exerciseStatsLines, type HistoryEntry } from "@/lib/domain/stats-screens";
import { distanceSymbol, weightSymbol } from "@/lib/domain/units";
import { useExerciseHistory } from "@/lib/repo";
import { useExercise, useUserSettings, type UserSettingsValues } from "@/lib/repo/hooks";
import type { Exercise } from "@/types/models";

/**
 * Port of ExercisesStatsDetailView.swift: the totals of an exercise, its progress over time, the personal record and
 * every time it was done
 */
export default function ExerciseStatsDetailPage() {
  const { exerciseId } = useParams<{ exerciseId: string }>();
  const exercise = useExercise(exerciseId);
  const history = useExerciseHistory(exerciseId);
  const settings = useUserSettings();

  if (exercise === undefined || history === undefined || settings === undefined) return null;
  if (exercise === null) notFound();

  const summary = summaryOfWorkoutExercises(history);
  const record = personalRecordSet(exercise, history, summary);
  const recordEntry = record && history.find((entry) => entry.id === record.workoutExerciseId);

  return (
    <Page className="bg-grouped">
      <PageHeader title={exercise.name} back={{ href: "/stats/exercises", label: "Exercises" }} />
      {history.length === 0 ? (
        <ContentUnavailable
          icon={Dumbbell}
          title="Not done yet"
          description="You have never done this exercise. You will see your past workouts with this exercise here."
          className="pt-[16dvh]"
        />
      ) : (
        <div className="flex flex-col gap-6 px-4 pb-6">
          <ValueTiles lines={exerciseStatsLines(exercise, history, settings)} />

          {chartMetrics(exercise).length > 0 && <ProgressCard exercise={exercise} history={history} settings={settings} />}

          {recordEntry && summary.personalRecord && (
            <div className="card flex items-center gap-3.5 p-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-app/12 text-app" aria-hidden>
                <Trophy size={22} className="fill-current" />
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-footnote text-secondary-label">Personal record</span>
                <span className="font-rounded text-title3 font-bold">{formatRecord(summary.personalRecord, settings.weightUnit)}</span>
                <span className="truncate text-subheadline text-secondary-label">
                  {recordEntry.workout.name} · {formatDate(recordEntry.workout.date)}
                </span>
              </div>
            </div>
          )}

          <section className="flex flex-col gap-2.5">
            <StatsSectionHeader title="History" />
            <ExerciseHistoryCard history={history} record={record} units={settings} />
          </section>
        </div>
      )}
    </Page>
  );
}

/** The progress chart with the metric and the period to show (chartCard) */
function ProgressCard({
  exercise,
  history,
  settings,
}: {
  exercise: Exercise;
  history: readonly HistoryEntry[];
  settings: UserSettingsValues;
}) {
  const metrics = chartMetrics(exercise);
  const [chosenMetric, setMetric] = useState<ExerciseChartMetric>(metrics[0]);
  const metric = metrics.includes(chosenMetric) ? chosenMetric : metrics[0];
  const [range, setRange] = useState<ExerciseChartRange>("6M");

  const start = chartRangeStart(range, new Date());
  const points = history
    .flatMap((entry) => {
      if (start && entry.workout.date < start) return [];
      const value = chartValue(entry, metric, settings);
      return value === null ? [] : [{ date: entry.workout.date, value }];
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  return (
    <section className="card flex flex-col gap-3 p-4" aria-label="Progress">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-headline font-semibold">Progress</h2>
        <span className="text-footnote text-secondary-label">
          {chartUnit(metric, weightSymbol(settings.weightUnit), distanceSymbol(settings.distanceUnit))}
        </span>
      </div>
      {metrics.length > 1 && (
        <AppColorSegmentedPicker
          label="Value"
          options={metrics}
          selection={metric}
          title={(option) => CHART_METRIC_TITLES[option]}
          onChange={setMetric}
        />
      )}
      <ProgressChart points={points} label={`${CHART_METRIC_TITLES[metric]} per workout`} />
      <AppColorSegmentedPicker label="Period" options={CHART_RANGES} selection={range} onChange={setRange} />
    </section>
  );
}
