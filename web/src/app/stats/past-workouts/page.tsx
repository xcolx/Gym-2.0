"use client";

import Link from "next/link";
import { CalendarDays, ChevronRight, Ellipsis, FileDown, FileUp } from "lucide-react";
import { useState } from "react";

import { ImportWorkoutsSheet } from "@/components/stats/ImportWorkoutsSheet";
import { WorkoutExportSheet } from "@/components/stats/WorkoutExportSheet";
import { ContentUnavailable } from "@/components/ui/ContentUnavailable";
import { Menu } from "@/components/ui/Menu";
import { Page, PageHeader } from "@/components/ui/Page";
import { DEFAULT_APP_COLOR } from "@/lib/app-color";
import { appLocale } from "@/lib/domain/format";
import { formatDuration } from "@/lib/domain/stats";
import { countOf, workoutsByMonth } from "@/lib/domain/stats-overview";
import { formatMonthYear } from "@/lib/domain/format";
import { numberOfSets } from "@/lib/domain/workout-exercise";
import { useFinishedWorkouts, useUserSettings } from "@/lib/repo/hooks";
import type { WorkoutWithExercises } from "@/types/models";

/** Port of PastWorkoutsView.swift: the finished workouts by month, the newest first, with the import and the export */
export default function PastWorkoutsPage() {
  const workouts = useFinishedWorkouts();
  const settings = useUserSettings();
  const [showExport, setShowExport] = useState(false);
  const [showImport, setShowImport] = useState(false);

  return (
    <Page className="bg-grouped">
      <PageHeader
        title="Past workouts"
        back={{ href: "/stats", label: "Statistics" }}
        trailing={
          <Menu
            label="More"
            items={[
              { label: "Export workouts", icon: FileUp, disabled: !workouts?.length, onSelect: () => setShowExport(true) },
              { label: "Import workouts", icon: FileDown, onSelect: () => setShowImport(true) },
            ]}
          >
            <Ellipsis size={24} />
          </Menu>
        }
      />

      {workouts &&
        (workouts.length === 0 ? (
          <ContentUnavailable
            icon={CalendarDays}
            title="No workouts yet"
            description="Your finished workouts show up here."
            className="pt-[18dvh]"
          />
        ) : (
          <div className="flex flex-col gap-[35px] px-4 pb-6 pt-2">
            {workoutsByMonth(workouts).map(({ month, workouts: ofMonth }) => (
              <section key={month.getTime()}>
                <h2 className="px-4 pb-1.5 text-footnote font-semibold text-secondary-label">
                  {formatMonthYear(month)} · {countOf(ofMonth.length, "workout", "workouts")}
                </h2>
                <ul className="overflow-hidden rounded-[20px] bg-cell">
                  {ofMonth.map((workout) => (
                    <li key={workout.id} className="pl-4 [&:last-child>a]:border-b-0">
                      <PastWorkoutRow workout={workout} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ))}

      <WorkoutExportSheet
        open={showExport}
        onClose={() => setShowExport(false)}
        workouts={workouts ?? []}
        appColor={settings?.schemeColor ?? DEFAULT_APP_COLOR}
      />
      <ImportWorkoutsSheet open={showImport} onClose={() => setShowImport(false)} />
    </Page>
  );
}

/** PastWorkoutRow: the day, the name, the duration, the sets and the exercises of a workout */
function PastWorkoutRow({ workout }: { workout: WorkoutWithExercises }) {
  const locale = appLocale();
  const sets = workout.workoutExercises.reduce((sum, workoutExercise) => sum + numberOfSets(workoutExercise), 0);
  const exercises = workout.workoutExercises.length;
  return (
    <Link
      href={`/stats/past-workouts/${workout.id}`}
      aria-label={`${workout.name}, ${workout.date.toLocaleDateString(locale, { dateStyle: "full" })}`}
      className="flex items-center gap-3.5 border-b border-separator py-2.5 pr-4 active:opacity-50"
    >
      <span className="flex size-[46px] shrink-0 flex-col items-center justify-center rounded-[10px] bg-app/12 text-app" aria-hidden>
        <span className="text-[10px] font-semibold uppercase leading-3">
          {workout.date.toLocaleDateString(locale, { weekday: "short" })}
        </span>
        <span className="font-rounded text-title3 font-bold">{workout.date.getDate()}</span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-medium">{workout.name}</span>
        <span className="truncate text-subheadline text-secondary-label">
          {formatDuration(workout.duration)} · {countOf(sets, "set", "sets")} · {countOf(exercises, "exercise", "exercises")}
        </span>
      </span>
      <ChevronRight size={18} strokeWidth={2.5} className="shrink-0 text-tab-inactive/70" aria-hidden />
    </Link>
  );
}
