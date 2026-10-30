"use client";

// Port of ios/Gym 2.0/Features/Workout/Exercises/CreateExerciseView.swift

import { useRef, useState } from "react";
import { CirclePlus, Download, ImagePlus, Pencil, Trash2, X } from "lucide-react";

import { HighlightedBody } from "@/components/ui/HighlightedBody";
import { EXERCISE_LIMITS, exerciseCanChangeTrackedMetrics, musclesWithIds } from "@/lib/domain/exercise";
import {
  addAlias,
  aliasProblem as aliasProblemOf,
  defaultTrackedMetrics,
  descriptionProblem as descriptionProblemOf,
  exerciseNameProblem,
  isExerciseNameTaken,
  isSameName,
  sortedMetrics,
  trackingFlags,
} from "@/lib/domain/exercise-form";
import { exerciseTrackedMetrics, SET_METRIC_NAMES } from "@/lib/domain/set-metric";
import { createExercise, deleteExercise, updateExercise } from "@/lib/repo";
import { useEquipment, useExerciseInScheme, useExerciseInUse, useExercises, useMuscleGroups, useMuscles, useReferenceData } from "@/lib/repo/hooks";
import { SET_METRICS, type Exercise, type SetMetric } from "@/types/models";
import { ActionSheet, type ActionSheetButton } from "@/components/ui/ActionSheet";
import { Alert } from "@/components/ui/Alert";
import { ExerciseImages, exerciseImageItems, prepareExerciseImage } from "./exercise-image";
import { FullScreenCover } from "@/components/ui/overlay";

export function CreateExercise({
  open,
  exercise,
  onClose,
  onDeleted,
}: {
  open: boolean;
  /** null to create a new exercise */
  exercise: Exercise | null;
  onClose: () => void;
  /** After the exercise was deleted, e.g. to leave its detail */
  onDeleted?: () => void;
}) {
  return (
    <FullScreenCover open={open} onClose={onClose} label={exercise ? `Edit ${exercise.name}` : "Create Exercise"}>
      <ExerciseForm exercise={exercise} onClose={onClose} onDeleted={onDeleted} />
    </FullScreenCover>
  );
}

type Picker = "primary" | "secondary" | "equipment" | "muscleGroup" | "photo";

const chip = "min-h-9 rounded-full px-3 py-1.5 text-[15px] leading-5";

function ExerciseForm({ exercise, onClose, onDeleted }: { exercise: Exercise | null; onClose: () => void; onDeleted?: () => void }) {
  const exercises = useExercises();
  const allMuscles = useMuscles();
  const allMuscleGroups = useMuscleGroups();
  const allEquipment = useEquipment();
  const reference = useReferenceData();
  const inUse = useExerciseInUse(exercise?.id);
  const inScheme = useExerciseInScheme(exercise?.id);

  const [name, setName] = useState(exercise?.name ?? "");
  // other names, only used by the search
  const [aliases, setAliases] = useState<string[]>(exercise?.aliases ?? []);
  const [newAlias, setNewAlias] = useState("");
  const [description, setDescription] = useState(exercise?.exerciseDescription ?? "");
  const [muscleGroupId, setMuscleGroupId] = useState<number | null>(exercise?.muscleGroupId ?? null);
  const [primaryIds, setPrimaryIds] = useState<number[]>(exercise?.primaryMuscleIds ?? []);
  const [secondaryIds, setSecondaryIds] = useState<number[]>(exercise?.secondaryMuscleIds ?? []);
  const [equipmentId, setEquipmentId] = useState<number | null>(exercise?.equipmentId ?? null);
  // the uploaded images that are kept, followed by the new ones
  const [imageUrls, setImageUrls] = useState<string[]>(exercise?.imageUrls ?? []);
  const [photos, setPhotos] = useState<Blob[]>(exercise?.pendingImages ?? []);
  const [photosChanged, setPhotosChanged] = useState(false);
  const imageCount = imageUrls.length + photos.length;
  const [trackedMetrics, setTrackedMetrics] = useState<SetMetric[]>(exercise ? exerciseTrackedMetrics(exercise) : ["reps", "weights"]);
  // until the user picks the metrics, they follow the equipment
  const [metricsChangedByUser, setMetricsChangedByUser] = useState(false);
  const [nameTakenWarning, setNameTakenWarning] = useState(false);
  const [missingSelectionWarning, setMissingSelectionWarning] = useState(false);
  const [picker, setPicker] = useState<Picker | null>(null);
  const [alert, setAlert] = useState<"delete" | "nonDeletable" | "inScheme" | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const filesInput = useRef<HTMLInputElement>(null);

  const trimmedName = name.trim();
  const trimmedDescription = description.trim();
  const nameProblem = exerciseNameProblem(trimmedName, { missingSelectionWarning, nameTakenWarning });
  const aliasProblem = aliasProblemOf(newAlias.trim());
  const descriptionProblem = descriptionProblemOf(trimmedDescription);
  const problem = nameProblem ?? aliasProblem ?? descriptionProblem;

  // The set data of performed workouts depends on the tracked metrics, so they are fixed once the exercise was performed
  const canChangeTrackedMetrics = exercise ? inUse !== undefined && exerciseCanChangeTrackedMetrics(exercise, inUse) : true;

  const muscleName = (id: number) => reference?.muscles.get(id)?.name ?? "";
  const primaryMuscles = reference ? musclesWithIds(primaryIds, reference) : [];
  const secondaryMuscles = reference ? musclesWithIds(secondaryIds, reference) : [];

  // Names that are already there are ignored, like the server does
  const submitAlias = () => {
    const added = addAlias(aliases, newAlias, trimmedName);
    if (!added) return null;
    setAliases(added);
    setNewAlias("");
    return added;
  };

  const save = async () => {
    const taken = isExerciseNameTaken(exercises ?? [], trimmedName, exercise?.id ?? null);
    setNameTakenWarning(taken);
    if (muscleGroupId === null || equipmentId === null || trackedMetrics.length === 0 || trimmedName === "") {
      setMissingSelectionWarning(true);
      return;
    }
    // a name that was typed but not added yet
    const added = submitAlias();
    const typedAliasProblem = added ? null : aliasProblemOf(newAlias.trim());
    if (exerciseNameProblem(trimmedName, { missingSelectionWarning, nameTakenWarning: taken }) || typedAliasProblem || descriptionProblem) {
      return;
    }
    if (taken) return;

    const input = {
      name: trimmedName,
      // the name may have changed since an alias was added
      aliases: (added ?? aliases).filter((alias) => !isSameName(alias, trimmedName)),
      exerciseDescription: trimmedDescription === "" ? null : trimmedDescription,
      muscleGroupId,
      equipmentId,
      primaryMuscleIds: primaryIds,
      // exercises saved before a muscle could only be in one list may still have it in both
      secondaryMuscleIds: secondaryIds.filter((id) => !primaryIds.includes(id)),
      ...trackingFlags(trackedMetrics),
    };
    if (exercise) await updateExercise(exercise.id, input, photosChanged ? { imageUrls, pendingImages: photos } : undefined);
    else await createExercise(input, photos);
    onClose();
  };

  const pickPhotos = async (input: HTMLInputElement) => {
    const files = [...(input.files ?? [])].slice(0, EXERCISE_LIMITS.images - imageCount);
    input.value = "";
    const prepared: Blob[] = [];
    for (const file of files) {
      try {
        prepared.push(await prepareExerciseImage(file));
      } catch {
        // not an image the browser can read, left out
      }
    }
    if (prepared.length === 0) return;
    setPhotos((list) => [...list, ...prepared].slice(0, EXERCISE_LIMITS.images - imageUrls.length));
    setPhotosChanged(true);
  };

  const removeImage = (index: number) => {
    if (index < imageUrls.length) setImageUrls((list) => list.filter((_, i) => i !== index));
    else setPhotos((list) => list.filter((_, i) => i !== index - imageUrls.length));
    setPhotosChanged(true);
  };

  const toggleMetric = (metric: SetMetric) => {
    setMetricsChangedByUser(true);
    setTrackedMetrics((metrics) => (metrics.includes(metric) ? metrics.filter((m) => m !== metric) : sortedMetrics([...metrics, metric])));
  };

  const muscleButtons = (selected: number[], select: (id: number) => void, deselect: (id: number) => void): ActionSheetButton[] =>
    (allMuscles ?? []).map((muscle) =>
      selected.includes(muscle.serverId)
        ? { label: muscle.name, destructive: true, onSelect: () => deselect(muscle.serverId) }
        : { label: muscle.name, onSelect: () => select(muscle.serverId) },
    );

  const pickers: Record<Picker, { title: string; message: string; buttons: ActionSheetButton[] }> = {
    primary: {
      title: "Primary Muscles",
      message: "Select muscles to add/remove them from the list",
      buttons: muscleButtons(
        primaryIds,
        (id) => {
          setPrimaryIds((ids) => [...ids, id]);
          // a muscle is either primary or secondary, the server refuses it in both lists
          setSecondaryIds((ids) => ids.filter((other) => other !== id));
        },
        (id) => setPrimaryIds((ids) => ids.filter((other) => other !== id)),
      ),
    },
    secondary: {
      title: "Secondary Muscles",
      message: "Select muscles to add/remove them from the list",
      buttons: muscleButtons(
        secondaryIds,
        (id) => {
          setSecondaryIds((ids) => [...ids, id]);
          setPrimaryIds((ids) => ids.filter((other) => other !== id));
        },
        (id) => setSecondaryIds((ids) => ids.filter((other) => other !== id)),
      ),
    },
    equipment: {
      title: "Equipment",
      message: "Select the equipment needed for this exercise",
      buttons: (allEquipment ?? []).map((item) => ({
        label: item.name,
        onSelect: () => {
          setEquipmentId(item.serverId);
          // like in V2, the weight is not tracked for resistance bands
          if (!exercise && !metricsChangedByUser) setTrackedMetrics(defaultTrackedMetrics(item.name));
        },
      })),
    },
    muscleGroup: {
      title: "Muscle Group",
      message: "Select the most important muscle group for this exercise",
      buttons: (allMuscleGroups ?? []).map((group) => ({ label: group.name, onSelect: () => setMuscleGroupId(group.serverId) })),
    },
    photo: {
      title: "Image",
      message: "Take a photo of the exercise or choose some, e.g. one per keyframe of the movement",
      buttons: [
        { label: "Take Photo", onSelect: () => cameraInput.current?.click() },
        { label: "Choose Photos", onSelect: () => filesInput.current?.click() },
      ],
    },
  };

  const missing = (isMissing: boolean) => (missingSelectionWarning && isMissing ? "text-[#ff3b30]" : "");
  const editButton = (label: string, onClick: () => void, plus = false) => (
    <button type="button" aria-label={label} onClick={onClick} className="-my-2 flex h-11 w-11 items-center justify-center text-[#34c759] active:opacity-50">
      {plus ? <CirclePlus size={20} /> : <Pencil size={18} />}
    </button>
  );

  return (
    <div className="flex flex-col pb-6">
      {/* cancel, name and delete */}
      <div className="flex items-center gap-1 py-2.5 pr-2.5">
        <button type="button" aria-label="Cancel" onClick={onClose} className="flex h-11 w-12 shrink-0 items-center justify-center text-[#ff3b30] active:opacity-50">
          <X size={30} />
        </button>
        <input
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setNameTakenWarning(false);
          }}
          placeholder="Name of the Exercise"
          aria-label="Name of the Exercise"
          autoCorrect="off"
          autoComplete="off"
          enterKeyHint="done"
          className={`h-12 min-w-0 flex-1 rounded-[6px] border border-separator bg-background px-2 text-title2 outline-none placeholder:text-secondary-label focus:border-app ${
            nameProblem ? "text-[#ff3b30]" : "text-my-black"
          }`}
        />
        {exercise && (
          <button
            type="button"
            aria-label="Delete exercise"
            // like the server, it can't be deleted while a workout or a workout scheme contains it
            onClick={() => setAlert(inUse ? "nonDeletable" : inScheme ? "inScheme" : "delete")}
            disabled={inUse === undefined || inScheme === undefined}
            className="flex h-11 w-11 shrink-0 items-center justify-center text-[#ff3b30] active:opacity-50"
          >
            <Trash2 size={26} />
          </button>
        )}
      </div>

      {problem && <p className="px-2.5 text-footnote text-[#ff3b30]">{problem}</p>}

      {/* description and images */}
      <div className="grid grid-cols-2 gap-2.5 px-2.5 pt-1">
        <label className="flex flex-col">
          <span className="font-semibold">Description:</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="focus-ring aspect-square w-full resize-none border border-my-black bg-field/40 p-1 outline-none"
          />
        </label>
        <div className="flex flex-col">
          <span className="font-semibold">
            Images:{" "}
            <span className="font-normal text-secondary-label">
              {imageCount}/{EXERCISE_LIMITS.images}
            </span>
          </span>
          <div className="aspect-square w-full overflow-hidden bg-black">
            <ExerciseImages
              images={exerciseImageItems(imageUrls, photos)}
              placeholder={<ImagePlus size={40} className="text-white" />}
              onRemove={removeImage}
              trailing={
                imageCount < EXERCISE_LIMITS.images
                  ? {
                      label: "Add images",
                      content: (
                        <button
                          type="button"
                          aria-label="Add images"
                          onClick={() => setPicker("photo")}
                          className="flex h-full w-full flex-col items-center justify-center gap-1 text-white active:opacity-70"
                        >
                          <ImagePlus size={40} />
                          {imageCount > 0 && <span className="text-footnote">Add more</span>}
                        </button>
                      ),
                    }
                  : undefined
              }
            />
          </div>
          <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={(event) => void pickPhotos(event.currentTarget)} />
          <input ref={filesInput} type="file" accept="image/*" multiple hidden onChange={(event) => void pickPhotos(event.currentTarget)} />
        </div>
      </div>

      {/* Other names like "Military Press" for "Barbell Shoulder Press", so that the exercise is found by them */}
      <div className="px-2.5 pt-[5px]">
        <p className="font-semibold">Other Names:</p>
        <div className="mt-1 flex flex-wrap gap-2">
          {aliases.map((alias) => (
            <button
              key={alias}
              type="button"
              onClick={() => setAliases((list) => list.filter((other) => other !== alias))}
              className={`${chip} flex items-center gap-1 bg-app text-white active:opacity-60`}
              aria-label={`Remove ${alias}`}
            >
              {alias}
              <X size={12} strokeWidth={3} />
            </button>
          ))}
          {aliases.length < EXERCISE_LIMITS.aliasCount && (
            <input
              value={newAlias}
              onChange={(event) => setNewAlias(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submitAlias();
                }
              }}
              placeholder="Add a name"
              aria-label="Add another name"
              autoCorrect="off"
              autoComplete="off"
              enterKeyHint="done"
              className={`${chip} focus-ring w-[150px] bg-field/40 outline-none placeholder:text-secondary-label ${aliasProblem ? "text-[#ff3b30]" : "text-my-black"}`}
            />
          )}
        </div>
        <p className="mt-1 text-footnote text-secondary-label">Only used to find the exercise when searching.</p>
      </div>

      {/* tracked metrics */}
      <div className="px-2.5 py-[5px]">
        <p className={`font-semibold ${missing(trackedMetrics.length === 0)}`}>Tracked per Set:</p>
        <div className="mt-1 flex flex-wrap gap-2">
          {SET_METRICS.map((metric) => {
            const selected = trackedMetrics.includes(metric);
            return (
              <button
                key={metric}
                type="button"
                aria-pressed={selected}
                disabled={!canChangeTrackedMetrics}
                onClick={() => toggleMetric(metric)}
                className={`${chip} disabled:opacity-60 ${selected ? "bg-app text-white" : "bg-field/40 text-my-black"}`}
              >
                {SET_METRIC_NAMES[metric]}
              </button>
            );
          })}
        </div>
        {!canChangeTrackedMetrics && (
          <p className="mt-1 text-footnote text-secondary-label">
            You have already done a workout with this exercise, so the tracked values can&apos;t be changed.
          </p>
        )}
      </div>

      {/* highlighted body, muscles, equipment, save button */}
      <div className="flex gap-2.5 pr-2.5 pt-1">
        <div className="flex w-1/2 shrink-0 flex-col">
          <HighlightedBody className="w-full" primaryMuscles={primaryMuscles} secondaryMuscles={secondaryMuscles} />
          <div className="pb-2.5 pl-2.5 pt-2">
            <p className="flex items-center font-semibold">
              Muscle Group:
              {editButton("Select the muscle group", () => setPicker("muscleGroup"))}
            </p>
            <p className={missing(muscleGroupId === null)}>
              {muscleGroupId === null ? "Select a muscle group" : (reference?.muscleGroups.get(muscleGroupId)?.name ?? "")}
            </p>
          </div>
          <div className="pl-2.5">
            <p className="flex items-center font-semibold">
              Equipment needed:
              {editButton("Select the equipment", () => setPicker("equipment"))}
            </p>
            <p className={missing(equipmentId === null)}>
              {equipmentId === null ? "Select the equipment" : (reference?.equipment.get(equipmentId)?.name ?? "")}
            </p>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <p className="flex items-center font-semibold">
            Primary Muscles:
            {editButton("Add primary muscles", () => setPicker("primary"), true)}
          </p>
          {primaryIds.map((id) => (
            <p key={id}>{muscleName(id)}</p>
          ))}
          <p className="mt-2 flex items-center font-semibold">
            Secondary Muscles:
            {editButton("Add secondary muscles", () => setPicker("secondary"), true)}
          </p>
          {secondaryIds.map((id) => (
            <p key={id}>{muscleName(id)}</p>
          ))}
          <div className="flex flex-1 items-end justify-end pt-4">
            <button
              type="button"
              onClick={() => void save()}
              className="flex items-center gap-2 rounded-[25px] bg-[#34c759] p-[15px] text-title text-white active:opacity-60"
            >
              Save
              <Download size={26} />
            </button>
          </div>
        </div>
      </div>

      {picker && (
        <ActionSheet
          open
          title={pickers[picker].title}
          message={pickers[picker].message}
          buttons={pickers[picker].buttons}
          onClose={() => setPicker(null)}
        />
      )}

      <Alert
        open={alert === "nonDeletable"}
        title="You can't delete this exercise!"
        message="You have already done a workout with this exercise. Therefore it can't be deleted."
        buttons={[{ label: "Got it", role: "cancel" }]}
        onClose={() => setAlert(null)}
      />
      <Alert
        open={alert === "inScheme"}
        title="You can't delete this exercise!"
        message="This exercise is part of a workout scheme. Remove it from the scheme first to delete it."
        buttons={[{ label: "Got it", role: "cancel" }]}
        onClose={() => setAlert(null)}
      />
      <Alert
        open={alert === "delete"}
        title="Delete"
        message="Are you sure you want to delete this exercise?"
        buttons={[
          {
            label: "Delete",
            role: "destructive",
            onSelect: () => {
              if (!exercise) return;
              void deleteExercise(exercise.id).then(() => {
                onClose();
                onDeleted?.();
              });
            },
          },
          { label: "Go back", role: "cancel" },
        ]}
        onClose={() => setAlert(null)}
      />
    </div>
  );
}
