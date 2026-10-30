"use client";

import Link from "next/link";
import { ChevronRight, CircleCheck, Search } from "lucide-react";
import { useState } from "react";

import { Page, PageHeader } from "@/components/ui/Page";
import { exercisesWithStats } from "@/lib/domain/stats-screens";
import { useFinishedWorkouts } from "@/lib/repo/hooks";

/** Port of ExercisesStatsView.swift */
export default function ExercisesStatsPage() {
  const [searchText, setSearchText] = useState("");
  const workouts = useFinishedWorkouts();
  const exercises = workouts ? exercisesWithStats(workouts, searchText) : null;

  return (
    <Page className="bg-grouped">
      <PageHeader title="Stats by Exercise" back={{ href: "/stats", label: "Statistics" }} />
      <label className="focus-ring-within mx-4 mb-1 flex items-center gap-1.5 rounded-[10px] bg-field/40 px-2 py-[7px]">
        <Search size={18} className="shrink-0 text-secondary-label" />
        <input
          type="search"
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          placeholder="Search"
          autoCorrect="off"
          autoComplete="off"
          className="w-full bg-transparent text-body outline-none placeholder:text-secondary-label"
        />
      </label>

      {exercises && (
        <div className="px-4 pb-6">
          <p className="px-4 pb-1.5 pt-4 text-footnote uppercase text-secondary-label">
            Number of Exercises: {exercises.length}
          </p>
          {exercises.length === 0 && searchText !== "" ? (
            <div className="py-16 text-center">
              <Search size={48} className="mx-auto text-secondary-label" />
              <p className="mt-3 text-title2 font-bold">No Results</p>
              <p className="text-secondary-label">Check the spelling or try a new search.</p>
            </div>
          ) : (
            exercises.length > 0 && (
              <ul className="overflow-hidden rounded-[10px] bg-cell">
                {exercises.map((exercise) => (
                  <li key={exercise.id} className="pl-4 [&:last-child>a]:border-b-0">
                    <Link
                      href={`/stats/exercises/${exercise.id}`}
                      className="flex items-center gap-1.5 border-b border-separator py-[11px] pr-4 active:opacity-50"
                    >
                      <span className="min-w-0 truncate">{exercise.name}</span>
                      {exercise.verified && (
                        <CircleCheck size={18} className="shrink-0 text-[#007aff]" aria-label="Verified" />
                      )}
                      <span className="flex-1" />
                      <ChevronRight size={18} className="shrink-0 text-tab-inactive" />
                    </Link>
                  </li>
                ))}
              </ul>
            )
          )}
        </div>
      )}
    </Page>
  );
}
