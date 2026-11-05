"use client";

import Link from "next/link";
import {
  CalendarDays,
  ChevronRight,
  Clock,
  Dumbbell,
  Footprints,
  Layers,
  Lightbulb,
  Repeat,
  Weight,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ShareTextButton } from "@/components/stats/ShareTextButton";
import { ActivityBoard } from "@/components/stats/ActivityBoard";
import { StatsSectionHeader, TotalTile } from "@/components/stats/StatTiles";
import { Page, PageHeader } from "@/components/ui/Page";
import { timeWorkedOutShort } from "@/lib/domain/home";
import { interestingFacts } from "@/lib/domain/interesting-facts";
import { summaryOfWorkouts } from "@/lib/domain/stats";
import { countOf, relativeDay, statsOverview, topMuscles } from "@/lib/domain/stats-overview";
import { interestingFactShareText } from "@/lib/domain/stats-screens";
import { formatDistance, formatVolume } from "@/lib/domain/units";
import {
  useCurrentUser,
  useEquipment,
  useFinishedWorkouts,
  useMuscleGroups,
  useMuscles,
  useUserSettings,
} from "@/lib/repo/hooks";
import { useLocalStorage } from "@/lib/use-local-storage";
import { useNow } from "@/lib/use-now";

/**
 * Port of StatsView.swift: the totals, the activity of the last year, the links to the exercises and the past
 * workouts, the most trained muscles and one of the interesting facts
 */
export default function StatsPage() {
  const workouts = useFinishedWorkouts();
  const settings = useUserSettings();
  const muscles = useMuscles();
  const equipment = useEquipment();
  const muscleGroups = useMuscleGroups();
  const currentUser = useCurrentUser();
  const now = new Date(useNow(60_000));
  // The day of the activity board whose minutes are shown, until something else is tapped
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  // Moved on every time the stats are opened, so that another fact is shown. Kept on this device.
  const [factIndexText, setFactIndexText] = useLocalStorage("statsFactIndex", "0");
  const movedFact = useRef(false);
  useEffect(() => {
    if (movedFact.current) return;
    movedFact.current = true;
    setFactIndexText(String((Number(factIndexText) || 0) + 1));
  }, [factIndexText, setFactIndexText]);

  if (!workouts || !settings || !muscles || !equipment || !muscleGroups || currentUser === undefined) {
    return (
      <Page className="bg-grouped">
        <PageHeader title="Statistics" />
      </Page>
    );
  }

  const summary = summaryOfWorkouts(workouts);
  const overview = statsOverview(workouts);
  const facts = interestingFacts({
    workouts,
    equipment,
    muscleGroups,
    memberSince: currentUser?.createdAt ?? null,
    weightUnit: settings.weightUnit,
    distanceUnit: settings.distanceUnit,
  });
  const factIndex = Number(factIndexText) || 0;
  const fact = facts.length > 0 ? facts[((factIndex % facts.length) + facts.length) % facts.length] : null;
  const top = topMuscles(muscles, overview.setsByMuscleId);
  const highest = top[0]?.sets ?? 1;
  const lastWorkout = workouts[0];

  return (
    <Page className="bg-grouped">
      <PageHeader title="Statistics" />
      {/* a tap anywhere else than on a day of the activity board clears it */}
      <div className="flex flex-col gap-6 px-4 pb-6" onClick={() => setSelectedDay(null)}>
        <div className="grid grid-cols-3 gap-2.5">
          <TotalTile icon={Dumbbell} value={String(summary.workouts)} label="Workouts" />
          <TotalTile icon={Clock} value={timeWorkedOutShort(workouts)} label="Trained" />
          <TotalTile icon={Layers} value={String(summary.sets)} label="Sets" />
          <TotalTile icon={Repeat} value={String(Math.trunc(summary.reps.total))} label="Reps" />
          <TotalTile icon={Weight} value={formatVolume(summary.volume, settings.weightUnit)} label="Volume" />
          <TotalTile icon={Footprints} value={formatDistance(summary.distance.total, settings.distanceUnit)} label="Distance" />
        </div>

        <ActivityBoard minutesByDay={overview.minutesByDay} now={now} selectedDay={selectedDay} onSelectDay={setSelectedDay} />

        <nav className="card overflow-hidden" aria-label="Lists">
          <StatsLink
            href="/stats/exercises"
            icon={Dumbbell}
            title="Exercises"
            subtitle={`${countOf(overview.exerciseCount, "exercise", "exercises")} done`}
          />
          <div className="ml-14 border-t border-separator" />
          <StatsLink
            href="/stats/past-workouts"
            icon={CalendarDays}
            title="Past workouts"
            subtitle={lastWorkout ? `Last: ${lastWorkout.name} · ${relativeDay(lastWorkout.date, now)}` : "No workouts yet"}
          />
        </nav>

        <section className="flex flex-col gap-2.5">
          <StatsSectionHeader title="Muscles">
            {top.length > 0 && <SeeAllLink href="/stats/distribution" />}
          </StatsSectionHeader>
          <div className="card flex flex-col gap-3.5 p-4">
            {top.length === 0 ? (
              <p className="text-secondary-label">Your most trained muscles show up here after your first workout.</p>
            ) : (
              top.map(({ muscle, sets }) => (
                <div key={muscle.serverId} className="flex flex-col gap-1.5">
                  <div className="flex justify-between gap-3 text-subheadline">
                    <span>{muscle.name}</span>
                    <span className="text-secondary-label tabular-nums">{Math.round(sets)} sets</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-field" aria-hidden>
                    <div className="h-full rounded-full bg-app" style={{ width: `${(sets / highest) * 100}%` }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {fact && (
          <section className="flex flex-col gap-2.5">
            <StatsSectionHeader title="Interesting fact" />
            <article className="card flex flex-col gap-2 p-4">
              <div className="flex items-start gap-2">
                <h3 className="flex flex-1 items-start gap-2 text-headline font-semibold">
                  <Lightbulb size={19} className="mt-px shrink-0 fill-current text-app" aria-hidden />
                  {fact.title}
                </h3>
                <ShareTextButton text={() => interestingFactShareText(fact.text)} label="Share fact" className="text-app" />
              </div>
              <p className="text-subheadline text-secondary-label">{fact.text}</p>
            </article>
          </section>
        )}
      </div>
    </Page>
  );
}

/** LinkRow of StatsView.swift: a row that opens one of the lists of the stats */
function StatsLink({ href, icon: Icon, title, subtitle }: { href: string; icon: LucideIcon; title: string; subtitle: string }) {
  return (
    <Link href={href} className="flex items-center gap-3.5 p-4 hover:bg-field/15 active:bg-field/40">
      <Icon size={22} className="w-[26px] shrink-0 text-app" aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-medium">{title}</span>
        <span className="truncate text-subheadline text-secondary-label">{subtitle}</span>
      </span>
      <ChevronRight size={18} strokeWidth={2.5} className="-mr-1 shrink-0 text-tab-inactive/70" aria-hidden />
    </Link>
  );
}

function SeeAllLink({ href }: { href: string }) {
  return (
    <Link href={href} className="text-subheadline font-medium text-app hover:underline active:opacity-50">
      See all
    </Link>
  );
}
