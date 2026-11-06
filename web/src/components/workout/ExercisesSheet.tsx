"use client";

import { useCallback, useMemo, useState } from "react";
import { Check, ChevronDown, CircleMinus, Info, Plus, Search, X } from "lucide-react";

import { CreateExercise } from "@/components/workout/CreateExercise";
import { ExerciseDetail } from "@/components/workout/ExerciseDetail";
import { ContentUnavailable } from "@/components/ui/ContentUnavailable";
import { ExerciseName } from "@/components/ui/ExerciseName";
import { HighlightedBody } from "@/components/ui/HighlightedBody";
import { Menu } from "@/components/ui/Menu";
import { BottomActionBar, PrimaryButton } from "@/components/ui/PrimaryButton";
import { SearchField } from "@/components/ui/SearchField";
import { Sheet, SheetButton, useBackToClose } from "@/components/ui/overlay";
import { exerciseSearchNames } from "@/lib/domain/exercise";
import { exercisesByLetter } from "@/lib/domain/exercise-form";
import { fuzzyFilter } from "@/lib/domain/fuzzy-search";
import { exerciseCountText, exerciseDetailsText, musclesWorked, pickedPositions, withoutLastPick } from "@/lib/domain/workout-setup";
import { useEquipment, useExercises, useMuscleGroups, useMuscles, useReferenceData } from "@/lib/repo/hooks";
import type { Exercise, LocalId, Muscle, ReferenceData } from "@/types/models";

/**
 * Port of ExercisesView.swift, presented as a sheet: all exercises to pick from, filtered and searched. Tapping an
 * exercise picks it, again with every tap, since an exercise can be in a workout more than once. "Add" passes them in
 * the picked order to `onAdd` and closes the sheet. Opening it again starts empty, like on iOS.
 */
export function ExercisesSheet({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (exercises: Exercise[]) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} label="Exercises" grouped>
      <ExercisesNavigation onClose={onClose} onAdd={onAdd} />
    </Sheet>
  );
}

/** The NavigationStack of the sheet: the list and the detail of an exercise */
function ExercisesNavigation({ onClose, onAdd }: { onClose: () => void; onAdd: (exercises: Exercise[]) => void }) {
  const [detailId, setDetailId] = useState<LocalId | null>(null);
  /** In the order they were picked, the same exercise more than once if it was picked again */
  const [picked, setPicked] = useState<LocalId[]>([]);
  const exercises = useExercises();
  const back = useCallback(() => setDetailId(null), []);
  // the back button of Android goes back to the list, like the back of the NavigationStack
  useBackToClose(detailId !== null, back);

  const add = () => {
    const byId = new Map((exercises ?? []).map((exercise) => [exercise.id, exercise]));
    onAdd(picked.flatMap((id) => byId.get(id) ?? []));
    onClose();
  };

  return (
    <>
      {/* The list stays mounted under the detail, so the search and the scroll position are kept */}
      <div className={detailId ? "hidden" : "flex min-h-0 flex-1 flex-col"}>
        <ExerciseList
          exercises={exercises}
          picked={picked}
          onPick={(id) => setPicked((current) => [...current, id])}
          onUnpick={(id) => setPicked((current) => withoutLastPick(current, id))}
          onClear={() => setPicked([])}
          onAdd={add}
          onClose={onClose}
          onShow={setDetailId}
        />
      </div>
      {detailId && (
        <ExerciseDetail
          exerciseId={detailId}
          backLabel="Exercises"
          onBack={back}
          pickedCount={picked.filter((id) => id === detailId).length}
          onAdd={(exercise) => {
            setPicked((current) => [...current, exercise.id]);
            back();
          }}
        />
      )}
    </>
  );
}

function ExerciseList({
  exercises,
  picked,
  onPick,
  onUnpick,
  onClear,
  onAdd,
  onClose,
  onShow,
}: {
  exercises: Exercise[] | undefined;
  picked: LocalId[];
  onPick: (id: LocalId) => void;
  onUnpick: (id: LocalId) => void;
  onClear: () => void;
  onAdd: () => void;
  onClose: () => void;
  onShow: (id: LocalId) => void;
}) {
  const [query, setQuery] = useState("");
  const [muscleGroup, setMuscleGroup] = useState<number | null>(null);
  const [primaryMuscle, setPrimaryMuscle] = useState<number | null>(null);
  const [equipment, setEquipment] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const muscleGroups = useMuscleGroups();
  const muscles = useMuscles();
  const equipmentList = useEquipment();
  const reference = useReferenceData();
  const hasFilter = muscleGroup !== null || primaryMuscle !== null || equipment !== null;

  // Sorted by name, or by how well they match the search (incl. the other names)
  const filtered = useMemo(() => {
    const matching = (exercises ?? []).filter(
      (e) =>
        (muscleGroup === null || e.muscleGroupId === muscleGroup) &&
        (equipment === null || e.equipmentId === equipment) &&
        (primaryMuscle === null || e.primaryMuscleIds.includes(primaryMuscle)),
    );
    return query ? fuzzyFilter(matching, query, exerciseSearchNames) : matching;
  }, [exercises, query, muscleGroup, primaryMuscle, equipment]);

  const rows = (list: Exercise[]) => (
    <ul className="overflow-hidden rounded-[20px] bg-cell">
      {list.map((exercise) => (
        <ExerciseRow
          key={exercise.id}
          exercise={exercise}
          muscles={muscles ?? []}
          reference={reference}
          positions={pickedPositions(picked, exercise.id)}
          onPick={() => onPick(exercise.id)}
          onUnpick={() => onUnpick(exercise.id)}
          onShow={() => onShow(exercise.id)}
        />
      ))}
    </ul>
  );
  const header = (text: string) => <h3 className="px-4 pb-1.5 text-footnote font-semibold text-secondary-label">{text}</h3>;

  return (
    <>
      <div className="relative flex h-11 shrink-0 items-center justify-between px-4">
        <SheetButton onClick={onClose}>Cancel</SheetButton>
        <h2 className="absolute inset-x-24 text-center text-headline font-semibold">Exercises</h2>
        <button
          type="button"
          aria-label="Create exercise"
          className="z-10 flex h-11 items-center text-app active:opacity-50"
          onClick={() => setCreating(true)}
        >
          <Plus size={26} aria-hidden />
        </button>
      </div>

      <SearchField value={query} onChange={setQuery} label="Search exercises" className="mx-4 mt-1" />

      {/* the filters as chips with a menu of their options, filled in the app color while one is set */}
      <div className="flex shrink-0 gap-2 overflow-x-auto px-4 py-2.5 [scrollbar-width:none]">
        {hasFilter && (
          <button
            type="button"
            className={chipClass(false)}
            onClick={() => {
              setMuscleGroup(null);
              setPrimaryMuscle(null);
              setEquipment(null);
            }}
          >
            Clear
            <X size={13} strokeWidth={3} aria-hidden />
          </button>
        )}
        <FilterChip title="Muscle group" value={muscleGroup} options={muscleGroups ?? []} onChange={setMuscleGroup} />
        <FilterChip title="Muscle" value={primaryMuscle} options={muscles ?? []} onChange={setPrimaryMuscle} />
        <FilterChip title="Equipment" value={equipment} options={equipmentList ?? []} onChange={setEquipment} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
        {exercises && filtered.length === 0 ? (
          <ContentUnavailable
            icon={Search}
            title="No exercises found"
            description={hasFilter ? "Try other filters or another search." : "Try another search, or create the exercise."}
          >
            <button type="button" className="font-medium text-app active:opacity-50" onClick={() => setCreating(true)}>
              Create exercise
            </button>
          </ContentUnavailable>
        ) : query === "" ? (
          <div className="flex flex-col gap-4">
            {exercisesByLetter(filtered).map((group, index) => (
              <section key={group.letter}>
                {header(index === 0 ? `${exerciseCountText(filtered.length)} · ${group.letter}` : group.letter)}
                {rows(group.exercises)}
              </section>
            ))}
          </div>
        ) : (
          // Ranked by how well they match, so not split by letter
          <section>
            {header(exerciseCountText(filtered.length))}
            {rows(filtered)}
          </section>
        )}
      </div>

      <BottomActionBar inSheet>
        {picked.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="h-[52px] shrink-0 rounded-2xl bg-field/40 px-4 text-headline font-semibold transition-[scale,opacity] active:scale-[0.98] active:opacity-70"
          >
            Clear
          </button>
        )}
        <PrimaryButton disabled={picked.length === 0} onClick={onAdd}>
          {picked.length === 0 ? "Tap exercises to add them" : picked.length === 1 ? "Add 1 exercise" : `Add ${picked.length} exercises`}
        </PrimaryButton>
      </BottomActionBar>

      <CreateExercise open={creating} exercise={null} onClose={() => setCreating(false)} />
    </>
  );
}

/** exerciseRow of ExercisesView: a tap picks it, the minus removes the last pick, the info button opens the detail */
function ExerciseRow({
  exercise,
  muscles,
  reference,
  positions,
  onPick,
  onUnpick,
  onShow,
}: {
  exercise: Exercise;
  muscles: Muscle[];
  reference: ReferenceData | undefined;
  positions: number[];
  onPick: () => void;
  onUnpick: () => void;
  onShow: () => void;
}) {
  const worked = musclesWorked([exercise], muscles);
  const isPicked = positions.length > 0;
  return (
    <li
      className={`group/row relative flex items-center gap-1 pl-4 pr-2 transition-colors ${
        isPicked ? "bg-[color-mix(in_srgb,var(--app-color)_10%,var(--cell-bg))]" : ""
      }`}
    >
      <button
        type="button"
        onClick={onPick}
        aria-label={`Add ${exercise.name}${exercise.verified ? ", verified" : ""}`}
        className="flex min-w-0 flex-1 items-center gap-3 py-2 text-left active:opacity-60"
      >
        <HighlightedBody className="h-12 w-10 shrink-0" primaryMuscles={worked.primary} secondaryMuscles={worked.secondary} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <ExerciseName name={exercise.name} verified={exercise.verified} className="break-words font-medium" />
          {reference && <span className="truncate text-caption1 text-secondary-label">{exerciseDetailsText(exercise, reference)}</span>}
        </span>
        {isPicked && (
          <span
            className="flex shrink-0 items-center gap-[3px] rounded-full bg-app px-2 py-1 text-caption1 font-bold tabular-nums text-app-foreground"
            aria-label={positions.length === 1 ? `Added at position ${positions[0]}` : `Added at positions ${positions.join(", ")}`}
          >
            <Check size={11} strokeWidth={4} aria-hidden />
            {positions.join(", ")}
          </span>
        )}
      </button>
      {isPicked && (
        <button
          type="button"
          aria-label={`Remove ${exercise.name} once`}
          onClick={onUnpick}
          className="flex size-9 shrink-0 items-center justify-center text-secondary-label active:opacity-50"
        >
          <CircleMinus size={22} className="fill-current [&>path]:stroke-[var(--cell-bg)]" aria-hidden />
        </button>
      )}
      <button
        type="button"
        aria-label={`Details of ${exercise.name}`}
        onClick={onShow}
        className="flex size-9 shrink-0 items-center justify-center text-app active:opacity-50"
      >
        <Info size={22} aria-hidden />
      </button>
      <span className="absolute bottom-0 left-[68px] right-0 h-px bg-separator group-last/row:hidden" aria-hidden />
    </li>
  );
}

function chipClass(active: boolean) {
  return `flex shrink-0 items-center gap-1 rounded-full px-3 py-[7px] text-subheadline font-medium transition-colors ${
    active ? "bg-app text-app-foreground" : "bg-cell text-foreground"
  }`;
}

/** FilterChip of ExercisesView: a filter by the server id of reference data with a menu of its options, null for all */
function FilterChip({
  title,
  value,
  options,
  onChange,
}: {
  title: string;
  value: number | null;
  options: readonly { serverId: number; name: string }[];
  onChange: (value: number | null) => void;
}) {
  const selected = options.find((option) => option.serverId === value);
  return (
    <Menu
      label={title}
      items={[
        { label: "All", checked: value === null, onSelect: () => onChange(null) },
        ...options.map((option) => ({ label: option.name, checked: option.serverId === value, onSelect: () => onChange(option.serverId) })),
      ]}
    >
      <span className={chipClass(selected !== undefined)}>
        <span className="max-w-[160px] truncate">{selected?.name ?? title}</span>
        <ChevronDown size={13} strokeWidth={3} aria-hidden />
      </span>
    </Menu>
  );
}
