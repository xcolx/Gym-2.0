"use client";

import Link from "next/link";
import { ArrowUpDown, ChevronRight, Dumbbell, Search } from "lucide-react";
import { useState } from "react";

import { ContentUnavailable } from "@/components/ui/ContentUnavailable";
import { ExerciseName } from "@/components/ui/ExerciseName";
import { Menu } from "@/components/ui/Menu";
import { Page, PageHeader } from "@/components/ui/Page";
import { SearchField } from "@/components/ui/SearchField";
import {
  countOf,
  EXERCISE_STATS_SORTS,
  exerciseStatsRows,
  formatDayMonth,
  shownExerciseStatsRows,
  type ExerciseStatsSort,
} from "@/lib/domain/stats-overview";
import { useFinishedWorkouts } from "@/lib/repo/hooks";
import { useLocalStorage } from "@/lib/use-local-storage";

/** Port of ExercisesStatsView.swift: the exercises done in the finished workouts, with how often and when they were last done */
export default function ExercisesStatsPage() {
  const [searchText, setSearchText] = useState("");
  const [sortText, setSort] = useLocalStorage("exerciseStatsSort", "Name");
  const sort = (EXERCISE_STATS_SORTS as readonly string[]).includes(sortText) ? (sortText as ExerciseStatsSort) : "Name";
  const workouts = useFinishedWorkouts();
  const rows = workouts ? exerciseStatsRows(workouts) : null;
  const shownRows = rows ? shownExerciseStatsRows(rows, sort, searchText) : null;

  return (
    <Page className="bg-grouped">
      <PageHeader
        title="Exercises"
        back={{ href: "/stats", label: "Statistics" }}
        trailing={
          <Menu
            label="Sort"
            items={EXERCISE_STATS_SORTS.map((option) => ({
              label: option,
              checked: option === sort,
              onSelect: () => setSort(option),
            }))}
          >
            <ArrowUpDown size={22} />
          </Menu>
        }
      />
      <SearchField value={searchText} onChange={setSearchText} label="Search exercises" className="mx-4 mb-3" />

      {rows && shownRows && (
        <div className="px-4 pb-6">
          {rows.length === 0 ? (
            <ContentUnavailable
              icon={Dumbbell}
              title="No exercises yet"
              description="The exercises of your finished workouts show up here."
              className="pt-[16dvh]"
            />
          ) : shownRows.length === 0 ? (
            <ContentUnavailable
              icon={Search}
              title={`No results for “${searchText}”`}
              description="Check the spelling or try a new search."
              className="pt-[16dvh]"
            />
          ) : (
            <ul className="overflow-hidden rounded-[20px] bg-cell">
              {shownRows.map(({ exercise, workoutCount, lastDate }) => (
                <li key={exercise.id} className="pl-4 [&:last-child>a]:border-b-0">
                  <Link
                    href={`/stats/exercises/${exercise.id}`}
                    className="flex items-center gap-2 border-b border-separator py-2.5 pr-4 active:opacity-50"
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <ExerciseName name={exercise.name} verified={exercise.verified} />
                      <span className="text-subheadline text-secondary-label">
                        {countOf(workoutCount, "workout", "workouts")} · {formatDayMonth(lastDate)}
                      </span>
                    </span>
                    <ChevronRight size={18} strokeWidth={2.5} className="shrink-0 text-tab-inactive/70" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Page>
  );
}
