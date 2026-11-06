"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Sparkles, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Page, PageHeader } from "@/components/ui/Page";
import { WorkoutSchemes } from "@/components/workout/WorkoutSchemes";
import { InProgressWorkoutChooser } from "@/components/workout/InProgressWorkoutChooser";
import { activeWorkoutRoute } from "@/components/workout/start-workout";
import {
  getShownWorkout,
  setOpenedSinceTabEntered,
  setShownWorkout,
  wasOpenedSinceTabEntered,
} from "@/components/workout/workout-navigation";
import { useMuscles, useSchemes, useWorkoutsInProgress } from "@/lib/repo/hooks";
import type { Workout } from "@/types/models";

/**
 * Port of WorkoutView.swift and the workout part of MainView.swift: shows the workout in progress again if it was
 * open, otherwise opens the only workout in progress or asks which one to continue, and then the setup.
 */
export default function WorkoutPage() {
  const router = useRouter();
  const schemes = useSchemes();
  const muscles = useMuscles();
  const inProgress = useWorkoutsInProgress();
  const [showsChooser, setShowsChooser] = useState(false);
  const evaluated = useRef(false);

  const open = (workout: Pick<Workout, "id">) => {
    setShownWorkout(workout.id);
    router.push(activeWorkoutRoute(workout.id));
  };

  useEffect(() => {
    if (!inProgress || evaluated.current) return;
    evaluated.current = true;

    // the workout the tab showed before, as long as it is in progress (the navigation path on iOS)
    const shown = getShownWorkout();
    if (shown && inProgress.some((workout) => workout.id === shown)) {
      router.replace(activeWorkoutRoute(shown));
      return;
    }
    if (shown) setShownWorkout(null);

    if (wasOpenedSinceTabEntered()) return;
    setOpenedSinceTabEntered(true);
    if (inProgress.length === 1) {
      setShownWorkout(inProgress[0].id);
      router.replace(activeWorkoutRoute(inProgress[0].id));
    } else if (inProgress.length > 1) {
      // They are synced, so e.g. one started on another device can be in progress as well
      queueMicrotask(() => setShowsChooser(true));
    }
  }, [inProgress, router]);

  // Nothing while the workout in progress is about to be opened, so the setup doesn't flash
  const shown = getShownWorkout();
  const opensWorkout =
    !inProgress ||
    (!!shown && inProgress.some((workout) => workout.id === shown)) ||
    (!wasOpenedSinceTabEntered() && inProgress.length === 1);
  if (opensWorkout) return null;

  return (
    <Page className="bg-grouped">
      <PageHeader title="Workout" />
      <div className="flex flex-1 flex-col gap-6 px-4 pb-6">
        <div className="grid grid-cols-2 gap-3">
          <StartCard href="/workout/free" title="Free workout" subtitle="Pick your exercises" icon={Plus} />
          <StartCard href="/workout/suggested/settings" title="Suggested" subtitle="Based on your week" icon={Sparkles} />
        </div>
        <WorkoutSchemes schemes={schemes ?? []} muscles={muscles ?? []} />
      </div>
      <InProgressWorkoutChooser
        open={showsChooser}
        title="Several workouts are in progress"
        message="Which one do you want to continue now?"
        onOpen={open}
        onClose={() => setShowsChooser(false)}
      />
    </Page>
  );
}

/** StartCard of WorkoutView.swift: one of the two ways to start a workout without a saved one */
function StartCard({ href, title, subtitle, icon: Icon }: { href: string; title: string; subtitle: string; icon: LucideIcon }) {
  return (
    <Link href={href} className="card flex flex-col gap-3 p-4 transition-[scale,opacity] hover:opacity-90 active:scale-[0.98] active:opacity-80">
      <span className="flex size-11 items-center justify-center rounded-full bg-app text-app-foreground" aria-hidden>
        <Icon size={22} strokeWidth={2.5} />
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="truncate text-headline font-semibold">{title}</span>
        <span className="line-clamp-2 text-footnote text-secondary-label">{subtitle}</span>
      </span>
    </Link>
  );
}
