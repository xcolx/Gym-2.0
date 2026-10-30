"use client";

import { useCallback, useMemo, useState } from "react";
import { CircleCheck, CirclePlus, ChevronRight, Search } from "lucide-react";

import { CreateExercise } from "@/components/workout/CreateExercise";
import { ExerciseDetail } from "@/components/workout/ExerciseDetail";
import { Sheet, useBackToClose } from "@/components/ui/overlay";
import { exerciseSearchNames } from "@/lib/domain/exercise";
import { exercisesByLetter } from "@/lib/domain/exercise-form";
import { fuzzyFilter } from "@/lib/domain/fuzzy-search";
import { useEquipment, useExercises, useMuscleGroups, useMuscles } from "@/lib/repo/hooks";
import type { Exercise, LocalId } from "@/types/models";

/**
 * Port of ExercisesView.swift, presented as a sheet. Opening it again starts with an empty search, like on iOS.
 */
export function ExercisesSheet({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (exercise: Exercise) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} label="Exercises">
      <ExercisesNavigation onClose={onClose} onAdd={onAdd} />
    </Sheet>
  );
}

/** The NavigationStack of the sheet: the list and the detail of an exercise */
function ExercisesNavigation({ onClose, onAdd }: { onClose: () => void; onAdd: (exercise: Exercise) => void }) {
  const [detailId, setDetailId] = useState<LocalId | null>(null);
  const back = useCallback(() => setDetailId(null), []);
  // the back button of Android goes back to the list, like the back of the NavigationStack
  useBackToClose(detailId !== null, back);

  return (
    <>
      {/* The list stays mounted under the detail, so the search and the scroll position are kept */}
      <div className={detailId ? "hidden" : "flex min-h-0 flex-1 flex-col"}>
        <ExerciseList onClose={onClose} onShow={setDetailId} />
      </div>
      {detailId && (
        <ExerciseDetail
          exerciseId={detailId}
          backLabel="Exercises"
          onBack={back}
          onAdd={(exercise) => {
            onAdd(exercise);
            onClose();
          }}
        />
      )}
    </>
  );
}

function ExerciseList({ onClose, onShow }: { onClose: () => void; onShow: (id: LocalId) => void }) {
  const [query, setQuery] = useState("");
  const [muscleGroup, setMuscleGroup] = useState<number | null>(null);
  const [primaryMuscle, setPrimaryMuscle] = useState<number | null>(null);
  const [equipment, setEquipment] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const exercises = useExercises();
  const muscleGroups = useMuscleGroups();
  const muscles = useMuscles();
  const equipmentList = useEquipment();

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

  const sectionHeader = "px-4 pb-1.5 pt-4 text-footnote uppercase text-secondary-label";

  return (
    <>
      <div className="flex h-11 shrink-0 items-center justify-between px-2">
        <button type="button" className="h-11 px-2 text-body text-app active:opacity-50" onClick={onClose}>
          Done
        </button>
        <button
          type="button"
          aria-label="Create exercise"
          className="flex h-11 w-11 items-center justify-center text-[#34c759] active:opacity-50"
          onClick={() => setCreating(true)}
        >
          <CirclePlus size={24} />
        </button>
      </div>
      <h2 className="px-4 text-large-title font-bold tracking-tight">Exercises</h2>

      <label className="focus-ring-within mx-4 mt-2 flex min-h-11 items-center gap-1.5 rounded-[10px] bg-field/40 px-2">
        <Search size={18} className="shrink-0 text-secondary-label" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search"
          enterKeyHint="search"
          autoCorrect="off"
          autoComplete="off"
          className="w-full bg-transparent py-2 text-body outline-none placeholder:text-secondary-label"
        />
      </label>

      <div className="grid shrink-0 grid-cols-3 gap-2 px-4 pt-3 text-center">
        <Filter label="Muscle Group" value={muscleGroup} options={muscleGroups ?? []} onChange={setMuscleGroup} />
        <Filter label="Primary Muscle" value={primaryMuscle} options={muscles ?? []} onChange={setPrimaryMuscle} />
        <Filter label="Equipment" value={equipment} options={equipmentList ?? []} onChange={setEquipment} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
        {exercises && filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Search size={48} className="mx-auto text-secondary-label" />
            <p className="mt-3 text-title2 font-bold">No Results</p>
            <p className="text-secondary-label">Check the spelling or try a new search.</p>
          </div>
        ) : query === "" ? (
          <>
            <p className={sectionHeader}>Number of Exercises: {filtered.length}</p>
            {exercisesByLetter(filtered).map((group) => (
              <section key={group.letter}>
                <h3 className={sectionHeader}>{group.letter}</h3>
                <ExerciseRows exercises={group.exercises} onShow={onShow} />
              </section>
            ))}
          </>
        ) : (
          // Ranked by how well they match, so not split by letter
          <>
            <p className={sectionHeader}>Number of Exercises: {filtered.length}</p>
            <ExerciseRows exercises={filtered} onShow={onShow} />
          </>
        )}
      </div>

      <CreateExercise open={creating} exercise={null} onClose={() => setCreating(false)} />
    </>
  );
}

function ExerciseRows({ exercises, onShow }: { exercises: Exercise[]; onShow: (id: LocalId) => void }) {
  return (
    <ul className="overflow-hidden rounded-[10px] bg-cell">
      {exercises.map((e) => (
        <li key={e.id} className="pl-4 [&:last-child>button]:border-b-0">
          <button
            type="button"
            aria-label={e.verified ? `${e.name}, verified` : e.name}
            className="flex min-h-11 w-full items-center gap-1.5 border-b border-separator py-[11px] pr-3 text-left active:opacity-50"
            onClick={() => onShow(e.id)}
          >
            <span className="min-w-0 break-words">{e.name}</span>
            {e.verified && <CircleCheck size={18} className="shrink-0 text-[#007aff]" aria-label="Verified" />}
            <span className="flex-1" />
            <ChevronRight size={18} className="shrink-0 text-tab-inactive" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** A filter by the server id of reference data, null for all */
function Filter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: number | null;
  options: readonly { serverId: number; name: string }[];
  onChange: (v: number | null) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col items-center text-footnote">
      {label}
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className="focus-ring mt-0.5 min-h-9 max-w-full cursor-pointer appearance-none truncate rounded-[6px] bg-transparent px-1.5 text-center text-body text-app outline-none"
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.serverId} value={o.serverId}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}
