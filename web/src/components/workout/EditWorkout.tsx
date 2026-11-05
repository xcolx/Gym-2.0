"use client";

import { useState, type ReactNode } from "react";
import { Check, CirclePlus, Dumbbell, Play, Plus } from "lucide-react";

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
  tinted = false,
  onClick,
  children,
}: {
  label: string;
  destructive?: boolean;
  /** in the app color, e.g. the button that adds exercises */
  tinted?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`flex size-[52px] shrink-0 items-center justify-center rounded-2xl transition-[scale,opacity] active:scale-95 active:opacity-70 ${
        destructive ? "bg-[#ff3b30]/12 text-[#ff3b30] dark:text-[#ff453a]" : tinted ? "bg-app/15 text-app" : "bg-field/40 text-app"
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
