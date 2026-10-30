import type { StatLine } from "@/lib/domain/stats-screens";

/** Port of StatRowView.swift: one line of a stats summary per entry, e.g. "Total Reps      1234" */
export function StatRows({ lines, className = "" }: { lines: readonly StatLine[]; className?: string }) {
  return (
    <dl className={className}>
      {lines.map((line, index) => (
        // Titles can repeat ("Longest Set" of the time and of the distance)
        <div key={`${index}-${line.title}`} className="flex justify-between gap-3 py-0.5">
          <dt>{line.title}</dt>
          <dd className="text-right">{line.value}</dd>
        </div>
      ))}
    </dl>
  );
}
