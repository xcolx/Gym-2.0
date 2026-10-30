"use client";

import { StatRows } from "@/components/stats/StatRows";
import { Page, PageHeader, PillLink } from "@/components/ui/Page";
import { formatDuration, summaryOfWorkouts } from "@/lib/domain/stats";
import { formatDistance, formatVolume } from "@/lib/domain/units";
import { useFinishedWorkouts, useUserSettings } from "@/lib/repo/hooks";
import { STATS_SECTIONS } from "./sections";

/** Port of StatsView.swift with ImportantStatsView.swift */
export default function StatsPage() {
  const workouts = useFinishedWorkouts();
  const settings = useUserSettings();

  const summary = workouts && summaryOfWorkouts(workouts);
  const lines =
    summary && settings
      ? [
          { title: "Number of Workouts", value: String(summary.workouts) },
          { title: "Total Time Trained", value: formatDuration(summary.duration) },
          { title: "Total Sets", value: String(summary.sets) },
          { title: "Total Reps", value: String(Math.trunc(summary.reps.total)) },
          { title: "Total Volume", value: formatVolume(summary.volume, settings.weightUnit) },
          { title: "Total Distance", value: formatDistance(summary.distance.total, settings.distanceUnit) },
        ]
      : [];

  return (
    <Page>
      <PageHeader title="Statistics" />
      <div className="flex flex-col gap-2 p-2.5">
        <StatRows lines={lines} className="mb-[15px] px-2.5" />
        {STATS_SECTIONS.map((s) => (
          <PillLink key={s.slug} href={`/stats/${s.slug}`}>
            {s.title}
          </PillLink>
        ))}
      </div>
    </Page>
  );
}
