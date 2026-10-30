"use client";

import Link from "next/link";
import { FileDown, FileUp } from "lucide-react";
import { useState } from "react";

import { ImportWorkoutsSheet } from "@/components/stats/ImportWorkoutsSheet";
import { WorkoutExportSheet } from "@/components/stats/WorkoutExportSheet";
import { Page, PageHeader } from "@/components/ui/Page";
import { DEFAULT_APP_COLOR } from "@/lib/app-color";
import { formatDate } from "@/lib/domain/format";
import { useFinishedWorkouts, useUserSettings } from "@/lib/repo/hooks";

/** Port of PastWorkoutsView.swift */
export default function PastWorkoutsPage() {
  const workouts = useFinishedWorkouts();
  const settings = useUserSettings();
  const [showExport, setShowExport] = useState(false);
  const [showImport, setShowImport] = useState(false);

  return (
    <Page>
      <PageHeader
        title="Past Workouts"
        back={{ href: "/stats", label: "Statistics" }}
        trailing={
          <>
            <button
              type="button"
              aria-label="Export Workouts"
              className="text-my-black active:opacity-50"
              onClick={() => setShowExport(true)}
            >
              <FileUp size={22} strokeWidth={2.25} />
            </button>
            <button
              type="button"
              aria-label="Import Workouts"
              className="text-my-black active:opacity-50"
              onClick={() => setShowImport(true)}
            >
              <FileDown size={22} strokeWidth={2.25} />
            </button>
          </>
        }
      />

      {workouts &&
        (workouts.length === 0 ? (
          <p className="flex flex-1 items-center justify-center px-4 pb-24 text-center">
            You haven&apos;t completed any Workouts yet
          </p>
        ) : (
          <ul className="flex flex-col gap-2 p-2">
            {workouts.map((workout) => (
              <li key={workout.id}>
                <Link
                  href={`/stats/past-workouts/${workout.id}`}
                  className="flex rounded-[5px] bg-my-black p-[15px] text-headline font-semibold text-my-white active:opacity-60"
                >
                  <span className="shrink-0 pr-2.5">{formatDate(workout.date)}</span>
                  <span className="min-w-0 truncate">{workout.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        ))}

      <WorkoutExportSheet
        open={showExport}
        onClose={() => setShowExport(false)}
        workouts={workouts ?? []}
        appColor={settings?.schemeColor ?? DEFAULT_APP_COLOR}
      />
      <ImportWorkoutsSheet
        open={showImport}
        onClose={() => setShowImport(false)}
        appColor={settings?.schemeColor ?? DEFAULT_APP_COLOR}
      />
    </Page>
  );
}
