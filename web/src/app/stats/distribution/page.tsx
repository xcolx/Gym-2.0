"use client";

import { Dumbbell } from "lucide-react";
import { useState } from "react";

import { AppColorSegmentedPicker } from "@/components/ui/AppColorSegmentedPicker";
import { ContentUnavailable } from "@/components/ui/ContentUnavailable";
import { Page, PageHeader } from "@/components/ui/Page";
import {
  CATEGORY_CRITERIA,
  distributionRows,
  VALUE_CRITERIA,
  type CategoryCriteria,
  type ValueCriteria,
} from "@/lib/domain/muscle-distribution";
import { useFinishedWorkouts, useMuscleGroups, useMuscles } from "@/lib/repo/hooks";

/** Port of DistributionByMuscleView.swift: how much each muscle or muscle group was trained, the most first */
export default function DistributionPage() {
  const [value, setValue] = useState<ValueCriteria>("Sets");
  const [category, setCategory] = useState<CategoryCriteria>("Muscle");
  const workouts = useFinishedWorkouts();
  const muscles = useMuscles();
  const muscleGroups = useMuscleGroups();

  const header = <PageHeader title="Muscle distribution" inline back={{ href: "/stats", label: "Statistics" }} />;
  if (!workouts || !muscles || !muscleGroups) return <Page className="bg-grouped">{header}</Page>;

  const rows = distributionRows(workouts, muscles, muscleGroups, value, category);
  const highest = Math.max(rows[0]?.value ?? 0, 1);

  return (
    <Page className="bg-grouped">
      {header}
      {workouts.length === 0 ? (
        <ContentUnavailable
          icon={Dumbbell}
          title="No workouts yet"
          description="After your first workout you will see here how much you trained each muscle."
          className="pt-[18dvh]"
        />
      ) : (
        <div className="flex flex-col gap-3 px-4 pb-6 pt-2">
          <AppColorSegmentedPicker
            label="Category"
            options={CATEGORY_CRITERIA}
            selection={category}
            title={(option) => (option === "Muscle Group" ? "Muscle group" : option)}
            onChange={setCategory}
          />
          <AppColorSegmentedPicker label="Value" options={VALUE_CRITERIA} selection={value} onChange={setValue} />

          <ul className="card mt-1 grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-3 p-4" aria-label={`${value} per ${category.toLowerCase()}`}>
            {rows.map((row) => (
              <li key={row.name} className="col-span-3 grid grid-cols-subgrid items-center text-subheadline">
                <span>{row.name}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-field" aria-hidden>
                  <span
                    className="block h-full rounded-full bg-app transition-[width] duration-300"
                    style={{ width: `${(row.value / highest) * 100}%` }}
                  />
                </span>
                <span className="text-right text-secondary-label tabular-nums">{Math.round(row.value)}</span>
              </li>
            ))}
          </ul>

          {category === "Muscle" && value !== "Workouts" && (
            <p className="px-1 text-footnote text-secondary-label">A secondary muscle counts a third of a set.</p>
          )}
        </div>
      )}
    </Page>
  );
}
