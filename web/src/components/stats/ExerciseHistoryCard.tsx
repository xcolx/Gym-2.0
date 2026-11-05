import { Trophy } from "lucide-react";

import { formatDate } from "@/lib/domain/format";
import { entryDescriptions, type HistoryEntry } from "@/lib/domain/stats-screens";
import type { UnitSystem } from "@/types/models";

/**
 * Port of ExerciseHistoryCard.swift: the past times an exercise was done as a card, the newest first: the date, the
 * workout and every set, with the set of the personal record highlighted. With `scrolls` (while the exercise is done in
 * a workout) the card takes the space it gets and its rows scroll inside it.
 */
export function ExerciseHistoryCard({
  history,
  record,
  units,
  scrolls = false,
}: {
  /** The newest first */
  history: readonly HistoryEntry[];
  record: { workoutExerciseId: string; index: number } | null;
  units: { weightUnit: UnitSystem; distanceUnit: UnitSystem };
  scrolls?: boolean;
}) {
  return (
    <div className={`card ${scrolls ? "min-h-0 flex-1 overflow-y-auto" : "overflow-hidden"}`}>
      <ul>
        {history.map((entry) => (
          <li
            key={entry.id}
            className="mx-4 flex items-start gap-2 border-b border-separator py-3 text-subheadline last:border-b-0"
          >
            <span className="shrink-0 text-secondary-label">{formatDate(entry.workout.date)}</span>
            <span className="min-w-0 flex-1 break-words text-center">{entry.workout.name}</span>
            <span className="flex shrink-0 flex-col items-end">
              {entryDescriptions(entry, units).map((description, index) => {
                const isRecord = record?.workoutExerciseId === entry.id && record.index === index;
                return (
                  <span key={index} className={`flex items-center gap-1 ${isRecord ? "font-semibold text-app" : ""}`}>
                    {isRecord && <Trophy size={12} className="fill-current" aria-label="Personal record" />}
                    {description}
                  </span>
                );
              })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
