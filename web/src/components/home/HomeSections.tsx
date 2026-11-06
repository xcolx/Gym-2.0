"use client";

import { BadgeCheck } from "lucide-react";

import { MuscleCoverageGauge } from "@/components/home/MuscleCoverageGauge";
import { HighlightedBody } from "@/components/ui/HighlightedBody";
import { ProfileIcon } from "@/components/ui/ProfileIcon";
import { appColorForeground } from "@/lib/app-color";
import { formatMonthYear } from "@/lib/domain/format";
import { notTrainedMuscles, progressPercentage } from "@/lib/domain/home";
import { RECENT_DAYS } from "@/lib/domain/workout";
import type { Muscle, User } from "@/types/models";

/**
 * Port of ProfileBannerView.swift: profile image, username and account creation date of the current user, centered on
 * a header in the app color
 */
export function ProfileBanner({ user, schemeColor }: { user: User | null; schemeColor: string }) {
  const image = user?.profileImageUrl || null;
  return (
    <div className="flex flex-col items-center gap-1 bg-linear-to-b from-app/45 to-app/15 px-4 pb-[52px] pt-[calc(12px+env(safe-area-inset-top))] md:rounded-3xl md:pt-6">
      <div className="mb-1.5">
        <ProfileIcon hash={image} imageHash={image} size={96} color={schemeColor} label="Open profile image" />
      </div>
      {/* Empty until the first sync loaded the user */}
      <p className="max-w-full truncate text-title2 font-bold">{user?.username ?? " "}</p>
      {user?.createdAt && (
        <p className="text-subheadline text-secondary-label">Training since {formatMonthYear(user.createdAt)}</p>
      )}
    </div>
  );
}

/** The totals in the card below the header of HomeView.swift (workouts, time trained, sets) */
export function Totals({ totals }: { totals: { value: string; label: string }[] }) {
  return (
    <div className="card relative mx-4 -mt-9 flex divide-x divide-separator py-3.5">
      {totals.map(({ value, label }) => (
        <div key={label} className="flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1.5">
          <span className="max-w-full truncate font-rounded text-title2 font-bold tabular-nums">{value}</span>
          <span className="text-footnote text-secondary-label">{label}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * The muscles of the recent workouts (RecentMusclesView of HomeView.swift): the trained ones on the body in the gauge,
 * the others as chips below. Tapping a chip shows its muscle alone on the body, until something else is tapped.
 */
export function RecentMuscles({
  trained,
  muscles,
  appColor,
  selectedMuscle,
  onSelectMuscle,
}: {
  trained: [Muscle[], Muscle[]];
  /** Every muscle, sorted by name */
  muscles: Muscle[];
  appColor: string;
  selectedMuscle: Muscle | null;
  onSelectMuscle: (muscle: Muscle | null) => void;
}) {
  const { muscles: shownMuscles, slightlyTrained } = notTrainedMuscles(trained, muscles);
  // a muscle trained in the meantime is no longer in the list
  const selected = shownMuscles.find((muscle) => muscle.serverId === selectedMuscle?.serverId) ?? null;
  const isSelectedSlightlyTrained = selected !== null && slightlyTrained.has(selected.serverId);
  const foreground = appColorForeground(appColor);

  return (
    <section className="card m-4 flex flex-col gap-3 p-4">
      <h2 className="text-headline font-semibold">Muscles · last {RECENT_DAYS} days</h2>

      <div className="mx-auto w-full max-w-[340px]">
        <MuscleCoverageGauge percentage={progressPercentage(trained, muscles)}>
          <HighlightedBody
            primaryMuscles={trained[0]}
            secondaryMuscles={trained[1]}
            focusedMuscle={
              selected && {
                muscle: selected,
                color: isSelectedSlightlyTrained ? "var(--secondary-muscle)" : "var(--app-color)",
              }
            }
            className="h-full"
          />
        </MuscleCoverageGauge>
      </div>

      {muscles.length > 0 &&
        (shownMuscles.length === 0 ? (
          <p className="flex items-center gap-1.5 text-subheadline font-medium text-app">
            <BadgeCheck size={18} className="fill-current stroke-[var(--cell-bg)]" aria-hidden />
            Every muscle trained
          </p>
        ) : (
          <>
            <p className="text-subheadline text-secondary-label">Not trained yet</p>
            <ul className="flex flex-wrap gap-1.5">
              {shownMuscles.map((muscle) => {
                const isSelected = muscle.serverId === selected?.serverId;
                const isSlightlyTrained = slightlyTrained.has(muscle.serverId);
                return (
                  <li key={muscle.serverId}>
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      aria-label={isSlightlyTrained ? `${muscle.name}, trained slightly` : undefined}
                      onClick={(event) => {
                        // a tap next to the chips deselects the muscle
                        event.stopPropagation();
                        onSelectMuscle(isSelected ? null : muscle);
                      }}
                      className={`flex items-center gap-[5px] rounded-full px-2.5 py-[5px] text-subheadline transition-colors ${
                        isSelected ? "bg-app font-semibold" : "bg-app/15 hover:bg-app/25"
                      }`}
                      style={isSelected ? { color: foreground } : undefined}
                    >
                      {isSlightlyTrained && (
                        <span
                          className="size-[7px] rounded-full"
                          style={{ backgroundColor: isSelected ? foreground : "var(--secondary-muscle)" }}
                          aria-hidden
                        />
                      )}
                      {muscle.name}
                    </button>
                  </li>
                );
              })}
            </ul>
            {/* explains the dot of the selected muscle */}
            {isSelectedSlightlyTrained && (
              <p className="flex items-center gap-[5px] text-caption1 text-secondary-label" aria-hidden>
                <span className="size-[7px] rounded-full bg-[var(--secondary-muscle)]" />
                Trained slightly
              </p>
            )}
          </>
        ))}
    </section>
  );
}
