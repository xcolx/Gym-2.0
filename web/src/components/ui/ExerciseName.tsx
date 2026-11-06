import { BadgeCheck } from "lucide-react";

/** Port of ExerciseNameText.swift: the name of an exercise with the verified badge right after its last word */
export function ExerciseName({ name, verified, className = "" }: { name: string; verified: boolean; className?: string }) {
  if (!verified) return <span className={className}>{name}</span>;
  return (
    <span className={className} aria-label={`${name}, verified`}>
      {name}
      {/* no break between the last word and the badge, also when the name wraps */}
      {" "}
      <BadgeCheck
        size="1em"
        className="inline-block shrink-0 fill-current align-[-0.125em] text-app [&>path:last-child]:stroke-[var(--cell-bg)]"
        aria-hidden
      />
    </span>
  );
}
