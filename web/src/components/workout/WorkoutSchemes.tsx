"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { CirclePlus, Pencil } from "lucide-react";

import { ActionSheet } from "@/components/ui/ActionSheet";
import { useNow } from "@/lib/use-now";
import { formatRelativeNamed } from "@/lib/domain/relative-date";
import type { WorkoutScheme } from "@/types/models";

const LONG_PRESS_MS = 500;

/** Port of WorkoutSchemesView.swift */
export function WorkoutSchemes({ schemes }: { schemes: WorkoutScheme[] }) {
  const router = useRouter();
  const [showSheet, setShowSheet] = useState(false);
  // the context menu of a tile (long press or right click)
  const [menuScheme, setMenuScheme] = useState<WorkoutScheme | null>(null);
  const now = useNow(60_000);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center">
        <h2 className="flex-1 text-title">Your Own Workouts:</h2>
        <button
          type="button"
          onClick={() => setShowSheet(true)}
          aria-label="Edit a workout"
          className="flex h-11 w-11 items-center justify-center text-my-black active:opacity-50"
        >
          <Pencil size={20} strokeWidth={2.25} />
        </button>
        <Link
          href="/workout/schemes/add"
          aria-label="Add workout"
          className="mr-[15px] flex h-11 w-11 items-center justify-center text-my-black active:opacity-50"
        >
          <CirclePlus size={22} strokeWidth={2.25} />
        </Link>
      </div>

      <div className="mt-2 min-h-[240px] flex-1 overflow-y-auto rounded-[20px] bg-my-gray p-2">
        <div className="grid grid-cols-2 gap-2">
          {schemes.map((s) => (
            <div key={s.id} className="flex justify-center">
              <SchemeTile scheme={s} now={now} onContextMenu={() => setMenuScheme(s)} />
            </div>
          ))}
        </div>
      </div>

      <ActionSheet
        open={showSheet}
        title="Edit Workout"
        message="Choose the workout you would like to edit"
        buttons={schemes.map((s) => ({ label: s.name, onSelect: () => router.push(`/workout/schemes/${s.id}/edit`) }))}
        onClose={() => setShowSheet(false)}
      />
      <ActionSheet
        open={menuScheme !== null}
        title={menuScheme?.name ?? ""}
        buttons={menuScheme ? [{ label: "Edit", onSelect: () => router.push(`/workout/schemes/${menuScheme.id}/edit`) }] : []}
        onClose={() => setMenuScheme(null)}
      />
    </div>
  );
}

/** A scheme with the time since it was last performed. A long press opens its context menu instead. */
function SchemeTile({ scheme, now, onContextMenu }: { scheme: WorkoutScheme; now: number; onContextMenu: () => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  return (
    <Link
      href={`/workout/schemes/${scheme.id}`}
      className="flex max-w-full select-none flex-col items-center rounded-[20px] bg-app p-2.5 text-my-black [-webkit-touch-callout:none] active:opacity-60"
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
      <span className="max-w-full truncate text-title">{scheme.name}</span>
      {scheme.lastPerformed && now > 0 && (
        <span className="text-[12px] leading-4">{formatRelativeNamed(scheme.lastPerformed, new Date(now))}</span>
      )}
    </Link>
  );
}
