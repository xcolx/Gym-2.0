"use client";

import { useRouter } from "next/navigation";
import { Check, Sparkles } from "lucide-react";
import { useState } from "react";

import { Page, PageHeader } from "@/components/ui/Page";
import { BottomActionBar, PrimaryButton } from "@/components/ui/PrimaryButton";
import { suggestionRoute, useSuggestWorkout } from "@/components/workout/suggest-workout";
import { suggestedExerciseCount } from "@/lib/domain/suggest";
import { formatWorkoutMinutes, isAlwaysAvailable } from "@/lib/domain/workout-setup";
import { useEquipment } from "@/lib/repo/hooks";

const MIN = 15;
const MAX = 180;

/**
 * Port of SuggestedWorkoutSettingsView.swift: how long the suggested workout should take and which equipment is
 * available. The exercises are only picked when "Create workout" is tapped.
 */
export default function SuggestedWorkoutSettingsPage() {
  const router = useRouter();
  const [minutes, setMinutes] = useState(90);
  // server ids of the selected equipment, bodyweight exercises are always possible
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const equipment = useEquipment();
  const suggest = useSuggestWorkout();
  const count = suggestedExerciseCount(minutes);

  const toggle = (id: number) =>
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const create = () => {
    if (!suggest) return;
    const settings = { minutes, equipmentIds: [...selected] };
    router.push(suggestionRoute(suggest(settings), settings));
  };

  return (
    <Page className="bg-grouped">
      <PageHeader inline title="Suggested workout" back={{ href: "/workout", label: "Workout" }} />

      <div className="flex flex-col gap-4 px-4 pb-6 pt-2">
        <section className="card flex flex-col gap-3 p-4">
          <h2 className="text-headline font-semibold">How long?</h2>
          <p className="text-center font-rounded text-large-title font-bold tabular-nums" aria-live="polite">
            {formatWorkoutMinutes(minutes)}
          </p>
          <div className="flex items-center gap-2 text-caption1 text-secondary-label">
            <span>15 min</span>
            <input
              type="range"
              min={MIN}
              max={MAX}
              step={15}
              value={minutes}
              onChange={(event) => setMinutes(Number(event.target.value))}
              aria-label="Time"
              aria-valuetext={formatWorkoutMinutes(minutes)}
              className="ios-slider flex-1"
              style={{ "--fill": `${((minutes - MIN) / (MAX - MIN)) * 100}%` } as React.CSSProperties}
            />
            <span>3 h</span>
          </div>
          <p className="text-center text-footnote text-secondary-label">
            {count === 1 ? "About 1 exercise" : `About ${count} exercises`}
          </p>
        </section>

        <section className="card flex flex-col gap-3 p-4">
          <h2 className="text-headline font-semibold">Which equipment do you have?</h2>
          <div className="flex flex-wrap gap-2">
            {(equipment ?? []).map((item) => {
              const always = isAlwaysAvailable(item);
              const isSelected = always || selected.has(item.serverId);
              return (
                <button
                  key={item.serverId}
                  type="button"
                  aria-pressed={isSelected}
                  // always selected, but not dimmed like a disabled button
                  aria-disabled={always || undefined}
                  onClick={() => !always && toggle(item.serverId)}
                  className={`flex items-center gap-1 rounded-full px-3 py-2 text-subheadline font-medium transition-colors ${
                    isSelected ? "bg-app text-app-foreground" : "bg-field/40 text-foreground"
                  } ${always ? "cursor-default" : "active:opacity-70"}`}
                >
                  {isSelected && <Check size={13} strokeWidth={3.5} aria-hidden />}
                  {item.name}
                </button>
              );
            })}
          </div>
          <p className="text-footnote text-secondary-label">Bodyweight exercises are always included.</p>
        </section>
      </div>

      <BottomActionBar>
        <PrimaryButton onClick={create} disabled={!suggest}>
          <Sparkles size={18} className="mr-2" aria-hidden />
          Create workout
        </PrimaryButton>
      </BottomActionBar>
    </Page>
  );
}
