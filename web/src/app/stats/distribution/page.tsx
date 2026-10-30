"use client";

import { useState } from "react";

import { AppColorSegmentedPicker } from "@/components/ui/AppColorSegmentedPicker";
import { Page, PageHeader } from "@/components/ui/Page";
import { appColorForeground } from "@/lib/app-color";
import {
  CATEGORY_CRITERIA,
  distributionPercentages,
  VALUE_CRITERIA,
  type CategoryCriteria,
  type ValueCriteria,
} from "@/lib/domain/muscle-distribution";
import { useFinishedWorkouts, useMuscleGroups, useMuscles, useUserSettings } from "@/lib/repo/hooks";

/** Port of DistributionByMuscleView.swift with GeometryReaderBarView.swift */
export default function DistributionPage() {
  const [value, setValue] = useState<ValueCriteria>("Sets");
  const [category, setCategory] = useState<CategoryCriteria>("Muscle");
  const workouts = useFinishedWorkouts();
  const muscles = useMuscles();
  const muscleGroups = useMuscleGroups();
  const settings = useUserSettings();

  const header = <PageHeader title="Muscle Distribution" back={{ href: "/stats", label: "Statistics" }} />;
  if (!workouts || !muscles || !muscleGroups || !settings) return <Page>{header}</Page>;

  if (workouts.length === 0) {
    return (
      <Page>
        {header}
        <p className="p-2.5">
          You haven&apos;t done any workouts yet. After your first workout you will see the muscle distribution here.
        </p>
      </Page>
    );
  }

  const names = category === "Muscle" ? muscles : muscleGroups;
  const percentages = distributionPercentages(workouts, muscles, muscleGroups, value, category);
  const foreground = appColorForeground(settings.schemeColor);

  return (
    <Page>
      {header}
      <div className="flex gap-2 p-2.5">
        {/* Category names */}
        <ul className="flex w-[100px] shrink-0 flex-col gap-0.5">
          {names.map((item) => (
            <li key={item.serverId} className="h-5 truncate leading-5">
              {item.name}
            </li>
          ))}
        </ul>
        {/* Bars */}
        <ul className="flex min-w-0 flex-1 flex-col gap-0.5" aria-label={`${value} per ${category}`}>
          {names.map((item, index) => (
            <li
              key={item.serverId}
              className="h-5 bg-[#8e8e93]"
              title={`${item.name}: ${Math.round(percentages[index] ?? 0)} %`}
            >
              <div className="h-full bg-app" style={{ width: `${percentages[index] ?? 0}%` }} />
            </li>
          ))}
        </ul>
      </div>

      <div className="flex-1" />

      <div className="flex flex-col gap-2 px-2.5 pb-2.5">
        <AppColorSegmentedPicker
          label="Category"
          options={CATEGORY_CRITERIA}
          selection={category}
          onChange={setCategory}
          selectedForeground={foreground}
        />
        <AppColorSegmentedPicker
          label="Value"
          options={VALUE_CRITERIA}
          selection={value}
          onChange={setValue}
          selectedForeground={foreground}
        />
      </div>
    </Page>
  );
}
