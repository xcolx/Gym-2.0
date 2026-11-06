"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ListChecks, Play, Plus } from "lucide-react";

import { ActionSheet } from "@/components/ui/ActionSheet";
import { HighlightedBody } from "@/components/ui/HighlightedBody";
import { InProgressWorkoutChooser } from "@/components/workout/InProgressWorkoutChooser";
import { useStartWorkout } from "@/components/workout/start-workout";
import { useNow } from "@/lib/use-now";
import { musclesWorked, schemeDetails } from "@/lib/domain/workout-setup";
import { startWorkoutFromScheme } from "@/lib/repo";
import type { Muscle, WorkoutSchemeWithExercises } from "@/types/models";

const LONG_PRESS_MS = 500;

/**
 * Port of WorkoutSchemesView.swift: the user's own workouts on the workout start screen, each opened to change it before
 * it's started, or started right away with its play button. A long press (or right click) opens its menu.
 */
export function WorkoutSchemes({ schemes, muscles }: { schemes: WorkoutSchemeWithExercises[]; muscles: Muscle[] }) {
  const router = useRouter();
  const [showsEditSheet, setShowsEditSheet] = useState(false);
  // the context menu of a card (long press or right click)
  const [menuScheme, setMenuScheme] = useState<WorkoutSchemeWithExercises | null>(null);
  const now = useNow(60_000);
  const { start, chooser } = useStartWorkout();

  const startScheme = (scheme: WorkoutSchemeWithExercises) =>
    void start(() => startWorkoutFromScheme(scheme.id, scheme.name, scheme.exercises.map((exercise) => exercise.id)));

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-baseline gap-3 px-1">
        <h2 className="flex-1 text-title3 font-bold">Your workouts</h2>
        {schemes.length > 0 && (
          <button type="button" onClick={() => setShowsEditSheet(true)} className="text-subheadline font-medium text-app active:opacity-50">
            Edit
          </button>
        )}
        <Link href="/workout/schemes/add" aria-label="New workout" className="self-center text-app active:opacity-50">
          <span className="flex size-[22px] items-center justify-center rounded-full bg-app text-app-foreground">
            <Plus size={16} strokeWidth={3} aria-hidden />
          </span>
        </Link>
      </div>

      {schemes.length === 0 ? (
        <div className="card flex flex-col items-center gap-2.5 p-6 text-center">
          <ListChecks size={34} className="text-app" aria-hidden />
          <h3 className="text-headline font-semibold">No saved workouts yet</h3>
          <p className="text-subheadline text-secondary-label">Save the workouts you do often to start them in one tap.</p>
          <Link href="/workout/schemes/add" className="pt-1 text-subheadline font-semibold text-app active:opacity-50">
            Create a workout
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {schemes.map((scheme) => (
            <li key={scheme.id}>
              <SchemeCard
                scheme={scheme}
                muscles={muscles}
                now={now}
                onStart={() => startScheme(scheme)}
                onContextMenu={() => setMenuScheme(scheme)}
              />
            </li>
          ))}
        </ul>
      )}

      <ActionSheet
        open={showsEditSheet}
        title="Edit workout"
        message="Choose the workout you would like to edit"
        buttons={schemes.map((scheme) => ({ label: scheme.name, onSelect: () => router.push(`/workout/schemes/${scheme.id}/edit`) }))}
        onClose={() => setShowsEditSheet(false)}
      />
      <ActionSheet
        open={menuScheme !== null}
        title={menuScheme?.name ?? ""}
        buttons={
          menuScheme
            ? [
                ...(menuScheme.exercises.length > 0 ? [{ label: "Start", onSelect: () => startScheme(menuScheme) }] : []),
                { label: "Edit", onSelect: () => router.push(`/workout/schemes/${menuScheme.id}/edit`) },
              ]
            : []
        }
        onClose={() => setMenuScheme(null)}
      />
      <InProgressWorkoutChooser {...chooser} />
    </section>
  );
}

/** schemeCard of WorkoutSchemesView: the body with its muscles, the name, details and the play button */
function SchemeCard({
  scheme,
  muscles,
  now,
  onStart,
  onContextMenu,
}: {
  scheme: WorkoutSchemeWithExercises;
  muscles: Muscle[];
  now: number;
  onStart: () => void;
  onContextMenu: () => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const worked = musclesWorked(scheme.exercises, muscles);
  const count = scheme.exercises.length;

  return (
    <div className="card flex items-center gap-3 py-3 pl-4 pr-3">
      <Link
        href={`/workout/schemes/${scheme.id}`}
        className="flex min-w-0 flex-1 select-none items-center gap-3 [-webkit-touch-callout:none] active:opacity-60"
        onPointerDown={() => {
          longPressed.current = false;
          cancel();
          timer.current = setTimeout(() => {
            longPressed.current = true;
            onContextMenu();
          }, LONG_PRESS_MS);
        }}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onPointerCancel={cancel}
        onContextMenu={(event) => {
          event.preventDefault();
          if (!longPressed.current) onContextMenu();
          longPressed.current = true;
          cancel();
        }}
        onClick={(event) => {
          if (longPressed.current) event.preventDefault();
        }}
      >
        <HighlightedBody className="h-16 w-[54px] shrink-0" primaryMuscles={worked.primary} secondaryMuscles={worked.secondary} />
        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="line-clamp-2 break-words text-headline font-semibold">{scheme.name}</span>
          <span className="truncate text-subheadline text-secondary-label">
            {schemeDetails(count, now > 0 ? scheme.lastPerformed : null, new Date(now))}
          </span>
          {worked.primary.length > 0 && (
            <span className="truncate text-caption1 text-tab-inactive">{worked.primary.map((muscle) => muscle.name).join(", ")}</span>
          )}
        </span>
      </Link>
      <button
        type="button"
        aria-label={`Start ${scheme.name}`}
        disabled={count === 0}
        onClick={onStart}
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-app text-app-foreground transition-[scale,opacity] active:scale-90 disabled:opacity-40"
      >
        <Play size={16} className="ml-0.5 fill-current" aria-hidden />
      </button>
    </div>
  );
}

