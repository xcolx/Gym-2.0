"use client";

import { useRef, useState, type ReactNode } from "react";
import { CircleMinus, CirclePlus, GripHorizontal } from "lucide-react";

import { ExercisesSheet } from "./ExercisesSheet";
import { Page, PageHeader } from "@/components/ui/Page";
import { prefixCharacters } from "@/lib/domain/format";
import { MAX_WORKOUT_NAME_LENGTH } from "@/lib/domain/workout";
import type { Exercise } from "@/types/models";

/** Port of EditWorkoutView.swift */
export function EditWorkout({
  navTitle,
  back,
  workoutTitle,
  onWorkoutTitleChange,
  exerciseList,
  onExerciseListChange,
  children,
}: {
  navTitle: string;
  back: { href: string; label: string };
  workoutTitle: string;
  onWorkoutTitleChange: (v: string) => void;
  exerciseList: Exercise[];
  onExerciseListChange: (list: Exercise[]) => void;
  /** Bottom action, e.g. "Start Workout" */
  children?: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [showExercises, setShowExercises] = useState(false);

  return (
    <Page>
      <PageHeader
        title={navTitle}
        back={back}
        trailing={
          <>
            <button type="button" className="min-h-11 text-body active:opacity-50" onClick={() => setEditing((e) => !e)}>
              {editing ? <b className="font-semibold">Done</b> : "Edit"}
            </button>
            <button
              type="button"
              aria-label="Add exercise"
              className="flex h-11 w-11 items-center justify-center active:opacity-50"
              onClick={() => setShowExercises(true)}
            >
              <CirclePlus size={24} />
            </button>
          </>
        }
      />

      <div className="px-2.5">
        <WorkoutNameField value={workoutTitle} onChange={onWorkoutTitleChange} />
      </div>

      <div className="flex-1 px-5 py-5">
        <ReorderableRows
          items={exerciseList.map((e, i) => ({ key: `${e.id}-${i}`, name: e.name }))}
          editing={editing}
          onDelete={(index) => onExerciseListChange(exerciseList.filter((_, j) => j !== index))}
          onMove={(from, to) => {
            const next = [...exerciseList];
            const [moved] = next.splice(from, 1);
            next.splice(to, 0, moved);
            onExerciseListChange(next);
          }}
        />
      </div>

      {children && (
        <div className="sticky bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] flex justify-center pb-2.5 pt-2 md:bottom-0 md:pb-6">
          {children}
        </div>
      )}

      <ExercisesSheet
        open={showExercises}
        onClose={() => setShowExercises(false)}
        onAdd={(e) => onExerciseListChange([...exerciseList, e])}
      />
    </Page>
  );
}

/** "Give your Workout a Name", limited to the 25 characters the server takes */
export function WorkoutNameField({
  value,
  onChange,
  onBlur,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  className?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(prefixCharacters(e.target.value, MAX_WORKOUT_NAME_LENGTH))}
      onBlur={onBlur}
      placeholder="Give your Workout a Name"
      aria-label="Name of the workout"
      autoCorrect="off"
      autoComplete="off"
      enterKeyHint="done"
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      className={`focus-ring w-full rounded-[10px] bg-field p-2.5 text-title outline-none placeholder:text-secondary-label ${className}`}
    />
  );
}

const ROW_H = 44;
const DELETE_W = 80;

/**
 * Inset-grouped List with app-colored rows (or another background): delete + drag-to-reorder in edit mode, swipe to
 * the left to delete otherwise (`.onDelete` / `.onMove`). Like a List with an EditButton, the red minus only reveals
 * the "Delete" button, which deletes with a second tap; tapping the minus again or the row hides it.
 */
export function ReorderableRows({
  items,
  editing,
  onDelete,
  onMove,
  rowClassName = "bg-app",
}: {
  items: { key: string; name: string }[];
  editing: boolean;
  onDelete: (index: number) => void;
  onMove: (from: number, to: number) => void;
  rowClassName?: string;
}) {
  const [drag, setDrag] = useState<{ from: number; dy: number } | null>(null);
  const startY = useRef(0);
  // swipe to delete
  const [swipe, setSwipe] = useState<{ index: number; dx: number; dragging: boolean } | null>(null);
  const swipeStart = useRef<{ x: number; y: number; index: number; base: number; horizontal: boolean | null } | null>(null);
  // The row whose "Delete" button the minus revealed in edit mode, by key (rows move and get deleted)
  const [confirming, setConfirming] = useState<string | null>(null);
  const confirmingKey = editing && items.some((item) => item.key === confirming) ? confirming : null;

  if (items.length === 0) return null;

  const target = drag ? clamp(drag.from + Math.round(drag.dy / ROW_H), 0, items.length - 1) : -1;

  // Visual offset of each row while dragging, like UIKit's live reordering
  const offset = (i: number) => {
    if (!drag) return 0;
    if (i === drag.from) return drag.dy;
    if (drag.from < target && i > drag.from && i <= target) return -ROW_H;
    if (drag.from > target && i < drag.from && i >= target) return ROW_H;
    return 0;
  };
  const swipeOffset = (i: number) => (!editing && swipe?.index === i ? swipe.dx : 0);

  return (
    <ul className={`overflow-hidden rounded-[10px] text-white ${rowClassName}`}>
      {items.map((item, i) => (
        <li
          key={item.key}
          className={`relative h-11 first:rounded-t-[10px] last:rounded-b-[10px] ${drag?.from === i ? "z-10 shadow-lg" : "transition-transform duration-200"}`}
          style={{ transform: `translateY(${offset(i)}px)` }}
        >
          {confirmingKey === item.key && (
            <button
              type="button"
              className="absolute inset-y-0 right-0 z-10 flex items-center justify-center bg-[#ff3b30] text-body text-white"
              style={{ width: DELETE_W }}
              onClick={() => {
                setConfirming(null);
                onDelete(i);
              }}
            >
              Delete
            </button>
          )}
          {!editing && swipe?.index === i && (
            <button
              type="button"
              className="absolute inset-y-0 right-0 flex items-center justify-end bg-[#ff3b30] pr-4 text-body text-white"
              style={{ width: Math.max(DELETE_W, -swipe.dx) }}
              onClick={() => {
                setSwipe(null);
                onDelete(i);
              }}
            >
              Delete
            </button>
          )}
          <div
            className={`relative flex h-full items-center pl-4 ${rowClassName} ${swipe?.dragging ? "" : "transition-transform duration-200"} ${
              editing ? "" : "touch-pan-y"
            }`}
            style={{ transform: `translateX(${swipeOffset(i)}px)` }}
            onPointerDown={(ev) => {
              if (editing) return;
              swipeStart.current = { x: ev.clientX, y: ev.clientY, index: i, base: swipeOffset(i), horizontal: null };
              if (swipe && swipe.index !== i) setSwipe(null);
            }}
            onPointerMove={(ev) => {
              const start = swipeStart.current;
              if (!start || start.index !== i) return;
              const dx = ev.clientX - start.x;
              const dy = ev.clientY - start.y;
              if (start.horizontal === null && Math.hypot(dx, dy) > 8) {
                start.horizontal = Math.abs(dx) > Math.abs(dy);
                if (start.horizontal) ev.currentTarget.setPointerCapture(ev.pointerId);
              }
              if (start.horizontal) setSwipe({ index: i, dx: Math.min(0, start.base + dx), dragging: true });
            }}
            onPointerUp={() => {
              const start = swipeStart.current;
              swipeStart.current = null;
              if (!start?.horizontal || !swipe || swipe.index !== i) {
                if (swipe && !start?.horizontal) setSwipe(null);
                return;
              }
              setSwipe(swipe.dx < -DELETE_W / 2 ? { index: i, dx: -DELETE_W, dragging: false } : null);
            }}
            onPointerCancel={() => {
              swipeStart.current = null;
              setSwipe(null);
            }}
          >
            {editing && (
              <button
                type="button"
                aria-label={`Delete ${item.name}`}
                aria-expanded={confirmingKey === item.key}
                className="mr-3 flex h-11 shrink-0 items-center"
                onClick={() => setConfirming(confirmingKey === item.key ? null : item.key)}
              >
                <CircleMinus
                  size={22}
                  className={`fill-[#ff3b30] text-white transition-transform duration-200 ${confirmingKey === item.key ? "-rotate-90" : ""}`}
                />
              </button>
            )}
            <span
              className={`flex h-full min-w-0 flex-1 items-center truncate border-b border-white/25 ${editing ? "pr-12" : "pr-4"} ${
                i === items.length - 1 ? "border-b-0" : ""
              }`}
              onClick={confirmingKey ? () => setConfirming(null) : undefined}
            >
              {item.name}
            </span>
            {editing && confirmingKey !== item.key && (
              <span
                className="absolute inset-y-0 right-0 flex w-12 cursor-grab touch-none items-center justify-center text-white/70 active:cursor-grabbing"
                aria-label={`Reorder ${item.name}`}
                onPointerDown={(ev) => {
                  ev.currentTarget.setPointerCapture(ev.pointerId);
                  startY.current = ev.clientY;
                  setDrag({ from: i, dy: 0 });
                }}
                onPointerMove={(ev) => drag && setDrag({ ...drag, dy: ev.clientY - startY.current })}
                onPointerUp={() => {
                  if (drag && target !== drag.from) onMove(drag.from, target);
                  setDrag(null);
                }}
                onPointerCancel={() => setDrag(null)}
              >
                <GripHorizontal size={20} />
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
