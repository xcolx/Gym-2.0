import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import type { StatLine } from "@/lib/domain/stats-screens";

/** TotalTile of StatsView.swift: one of the totals at the top, with its icon in the app color */
export function TotalTile({ icon: Icon, value, label }: { icon: LucideIcon; value: string; label: string }) {
  return (
    <div role="group" aria-label={label} className="card flex min-w-0 flex-col gap-1.5 p-3">
      <Icon size={17} className="text-app" aria-hidden />
      <span className="truncate font-rounded text-title3 font-bold tabular-nums">{value}</span>
      <span className="text-footnote text-secondary-label">{label}</span>
    </div>
  );
}

/** The tiles of the totals of an exercise (statTiles of ExercisesStatsDetailView.swift), two per row */
export function ValueTiles({ lines }: { lines: readonly StatLine[] }) {
  return (
    <dl className="grid grid-cols-2 gap-2.5">
      {lines.map((line, index) => (
        // Titles can repeat ("Longest set" of the time and of the distance)
        <div key={`${index}-${line.title}`} className="card flex min-w-0 flex-col gap-1 p-3">
          <dt className="truncate text-footnote text-secondary-label">{line.title}</dt>
          <dd className="truncate font-rounded text-title3 font-bold tabular-nums">{line.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The title of a part of a stats screen, with an optional link or button on the right (SectionHeader) */
export function StatsSectionHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-1">
      <h2 className="text-title3 font-bold">{title}</h2>
      {children}
    </div>
  );
}
