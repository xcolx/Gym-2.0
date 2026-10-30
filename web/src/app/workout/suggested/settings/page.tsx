"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Page, PageHeader, PillButton } from "@/components/ui/Page";
import { suggestExercises } from "@/lib/domain/suggest";
import { musclesTrained } from "@/lib/domain/workout";
import { useEquipment, useExercises, useReferenceData, useWorkoutsThisWeek } from "@/lib/repo/hooks";
import type { Equipment } from "@/types/models";

const MIN = 15;
const MAX = 180;

/** e.g. "1 h 30 min" (SuggestedWorkoutSettingsView.formatTime) */
function formatMinutes(minutes: number) {
  const h = Math.trunc(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

/** Bodyweight exercises are always possible */
const isAlwaysAvailable = (item: Equipment) => item.name === "Body";

/** Port of SuggestedWorkoutSettingsView.swift */
export default function SuggestedWorkoutSettingsPage() {
  const router = useRouter();
  const [minutes, setMinutes] = useState(90);
  // server ids of the selected equipment
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const equipment = useEquipment();
  const exercises = useExercises();
  const workoutsThisWeek = useWorkoutsThisWeek();
  const reference = useReferenceData();

  const isSelected = (item: Equipment) => isAlwaysAvailable(item) || selected.has(item.serverId);

  const toggle = (item: Equipment) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(item.serverId)) next.delete(item.serverId);
      else next.add(item.serverId);
      return next;
    });

  const create = () => {
    if (!equipment || !exercises || !workoutsThisWeek || !reference) return;
    const available = new Set(equipment.filter(isSelected).map((item) => item.serverId));
    const [trained] = musclesTrained(workoutsThisWeek, reference);
    const ids = suggestExercises(exercises, available, minutes, trained).map((e) => e.id);
    router.push(`/workout/suggested/${ids.join("+") || "empty"}`);
  };

  return (
    <Page>
      <PageHeader title="Suggested Workout" back={{ href: "/workout", label: "Workout" }} />

      <div className="flex-1" />

      <p className="p-2.5">Which Equipment is available for your Workout?</p>
      <div className="grid grid-cols-2 gap-2">
        {(equipment ?? []).map((item) => (
          <div key={item.serverId} className="flex justify-center">
            <button
              type="button"
              onClick={() => toggle(item)}
              disabled={isAlwaysAvailable(item)}
              aria-pressed={isSelected(item)}
              className={`rounded-[20px] p-2.5 text-headline font-semibold text-my-black transition-colors ${
                isSelected(item) ? "bg-app" : "bg-my-gray"
              }`}
            >
              {item.name}
            </button>
          </div>
        ))}
      </div>

      <p className="p-2.5 pt-[30px]">How much time do you want to spend for this workout?</p>
      <p className="text-center">{formatMinutes(minutes)}</p>
      <div className="flex items-center gap-2 px-2.5">
        <span>15 min</span>
        <input
          type="range"
          min={MIN}
          max={MAX}
          step={15}
          value={minutes}
          onChange={(e) => setMinutes(Number(e.target.value))}
          aria-label="Time"
          className="ios-slider flex-1"
          style={{ "--fill": `${((minutes - MIN) / (MAX - MIN)) * 100}%` } as React.CSSProperties}
        />
        <span>3 h</span>
      </div>

      <div className="flex-[2]" />

      <div className="flex justify-center pb-2.5 md:pb-6">
        <PillButton onClick={create}>Create Workout for me!</PillButton>
      </div>
    </Page>
  );
}
