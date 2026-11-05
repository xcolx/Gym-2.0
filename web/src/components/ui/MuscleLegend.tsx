import type { Muscle } from "@/types/models";

/** The colors of HighlightedBody: the main muscles in red, the others in orange */
export const PRIMARY_MUSCLE_COLOR = "#ff0000";
export const SECONDARY_MUSCLE_COLOR = "var(--secondary-muscle)";

/** Port of MuscleLegend.swift: the muscles of one color of the body, with the dot of the color and its title */
export function MuscleLegend({ color, title, muscles }: { color: string; title: string; muscles: readonly Muscle[] }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="flex items-center gap-1.5 text-caption1 font-semibold text-secondary-label">
        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
        {title}
      </span>
      <span className="text-subheadline">{muscles.length === 0 ? "None" : muscles.map((muscle) => muscle.name).join(", ")}</span>
    </div>
  );
}
