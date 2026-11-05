"use client";

import { useRef, useState, type ReactNode } from "react";
import { Check, CircleMinus, CirclePlus, Dumbbell, GripHorizontal, Play, Plus } from "lucide-react";

import { ExercisesSheet } from "./ExercisesSheet";
import { ExerciseName } from "@/components/ui/ExerciseName";
import { FormRow, FormSection } from "@/components/ui/Form";
import { HighlightedBody } from "@/components/ui/HighlightedBody";
import { MuscleLegend, PRIMARY_MUSCLE_COLOR, SECONDARY_MUSCLE_COLOR } from "@/components/ui/MuscleLegend";
import { Page, PageHeader } from "@/components/ui/Page";
import { BottomActionBar } from "@/components/ui/PrimaryButton";
import { ReorderableList } from "@/components/ui/ReorderableList";
import { prefixCharacters } from "@/lib/domain/format";
import { MAX_WORKOUT_NAME_LENGTH } from "@/lib/domain/workout";
import { exerciseCountText, moved, musclesWorked } from "@/lib/domain/workout-setup";
import { useMuscles } from "@/lib/repo/hooks";
import type { Exercise } from "@/types/models";

const ROW_HEIGHT = 60;

/**
 * Port of EditWorkoutView.swift: the name and the exercises of a workout before it's started or saved, with its main
 * buttons at the bottom. The body shows the muscles of the whole workout, or of the tapped exercise. The exercises are
 * moved by dragging their handle and removed by swiping them to the left.
 */
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
  /** The buttons at the bottom, e.g. "Start workout" */
  children?: ReactNode;
}) {
  const [showExercises, setShowExercises] = useState(false);
  /** The exercise whose muscles are shown on the body instead of the ones of the whole workout, by position */
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const muscles = useMuscles();
  const muscleNames = new Map((muscles ?? []).map((muscle) => [muscle.serverId, muscle.name]));

  const change = (list: Exercise[]) => {
    // the positions changed
    setSelectedIndex(null);
    onExerciseListChange(list);
  };
  const selected = selectedIndex === null ? null : (exerciseList[selectedIndex] ?? null);
  const worked = musclesWorked(selected ? [selected] : exerciseList, muscles ?? []);

  return (
    <Page className="bg-grouped">
      <PageHeader
        inline
        title={navTitle}
        back={back}
        trailing={
          <button
            type="button"
            aria-label="Add exercises"
            className="flex h-11 w-9 items-center justify-center active:opacity-50"
            onClick={() => setShowExercises(true)}
          >
            <Plus size={26} aria-hidden />
          </button>
        }
      />

      <div className="flex flex-1 flex-col gap-[35px] px-4 pb-6 pt-2">
        <FormSection header="Name">
          <FormRow className="py-0" rowClassName="focus-ring-within rounded-[20px]">
            <WorkoutNameField value={workoutTitle} onChange={onWorkoutTitleChange} />
          </FormRow>
        </FormSection>

        {exerciseList.length > 0 && (
          <FormSection header="Muscles worked">
            <div className="flex items-center gap-4 px-4 py-3">
              <HighlightedBody className="h-[170px] shrink-0" primaryMuscles={worked.primary} secondaryMuscles={worked.secondary} />
              <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                {selected ? (
                  <ExerciseName name={selected.name} verified={selected.verified} className="line-clamp-2 text-headline font-semibold" />
                ) : (
                  <span className="text-headline font-semibold">Whole workout</span>
                )}
                <MuscleLegend color={PRIMARY_MUSCLE_COLOR} title="Main" muscles={worked.primary} />
                {worked.secondary.length > 0 && <MuscleLegend color={SECONDARY_MUSCLE_COLOR} title="Also" muscles={worked.secondary} />}
                <span className="text-[11px] leading-[13px] text-tab-inactive">
                  {selected ? "Tap it again to see the whole workout." : "Tap an exercise to see only its muscles."}
                </span>
              </div>
            </div>
          </FormSection>
        )}

        <FormSection
          header={exerciseList.length === 0 ? "Exercises" : exerciseCountText(exerciseList.length)}
          footer={exerciseList.length > 1 ? "Drag an exercise by its handle to move it, swipe it to the left to remove it." : undefined}
        >
          {exerciseList.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-4 py-5 text-center">
              <Dumbbell size={34} className="text-app" aria-hidden />
              <h3 className="text-headline font-semibold">No exercises yet</h3>
              <p className="text-subheadline text-secondary-label">Add the exercises you want to do.</p>
            </div>
          )}
          <ReorderableList
            // by position, an exercise can be in the list more than once
            items={exerciseList.map((exercise, index) => ({ key: `${exercise.id}-${index}`, label: exercise.name }))}
            rowHeight={ROW_HEIGHT}
            rowClassName={(index) => (index === selectedIndex ? "bg-[color-mix(in_srgb,var(--app-color)_12%,var(--cell-bg))]" : "bg-cell")}
            onMove={(from, to) => change(moved(exerciseList, from, to))}
            onDelete={(index) => change(exerciseList.filter((_, other) => other !== index))}
            renderRow={(index) => {
              const exercise = exerciseList[index];
              const isSelected = index === selectedIndex;
              const names = exercise.primaryMuscleIds.flatMap((id) => muscleNames.get(id) ?? []);
              return (
                <button
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setSelectedIndex(isSelected ? null : index)}
                  className="flex w-full items-center gap-3 py-2 text-left"
                >
                  <span
                    className={`flex size-[30px] shrink-0 items-center justify-center rounded-full text-subheadline font-semibold tabular-nums transition-colors ${
                      isSelected ? "bg-app text-app-foreground" : "bg-app/15 text-app"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <ExerciseName name={exercise.name} verified={exercise.verified} className="truncate font-medium" />
                    {names.length > 0 && <span className="truncate text-caption1 text-secondary-label">{names.join(", ")}</span>}
                  </span>
                </button>
              );
            }}
          />
          <button
            type="button"
            onClick={() => setShowExercises(true)}
            className={`flex min-h-11 w-full items-center gap-2.5 px-4 py-2.5 font-medium text-app hover:bg-field/15 active:bg-field/40 ${
              exerciseList.length > 0 ? "border-t border-separator" : ""
            }`}
          >
            <CirclePlus size={22} className="fill-current [&>path]:stroke-[var(--cell-bg)]" aria-hidden />
            Add exercises
          </button>
        </FormSection>
      </div>

      {children && <BottomActionBar>{children}</BottomActionBar>}

      <ExercisesSheet open={showExercises} onClose={() => setShowExercises(false)} onAdd={(added) => change([...exerciseList, ...added])} />
    </Page>
  );
}

/** The label of the main button that starts a workout */
export function StartLabel() {
  return (
    <>
      <Play size={17} className="mr-2 fill-current" aria-hidden />
      Start workout
    </>
  );
}

/** The label of the main button that saves a workout */
export function SaveLabel() {
  return (
    <>
      <Check size={19} strokeWidth={3} className="mr-2" aria-hidden />
      Save workout
    </>
  );
}

/** A square button next to the main button of the bottom bar, e.g. delete or shuffle (destructive: red) */
export function SquareActionButton({
  label,
  destructive = false,
  onClick,
  children,
}: {
  label: string;
  destructive?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`flex size-[52px] shrink-0 items-center justify-center rounded-2xl transition-[scale,opacity] active:scale-95 active:opacity-70 ${
        destructive ? "bg-[#ff3b30]/12 text-[#ff3b30] dark:text-[#ff453a]" : "bg-field/40 text-app"
      }`}
    >
      {children}
    </button>
  );
}

/** The name of a workout, limited to the 25 characters the server takes */
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
      placeholder="Workout name"
      aria-label="Name of the workout"
      autoCorrect="off"
      autoComplete="off"
      enterKeyHint="done"
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      className={`h-12 w-full min-w-0 bg-transparent text-title3 font-semibold outline-none placeholder:text-tab-inactive ${className}`}
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
