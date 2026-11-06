"use client";

// Port of ios/Gym 2.0/Features/Workout/Exercises/CreateExerciseView.swift

import { useRef, useState, type ReactNode } from "react";
import { BicepsFlexed, Check, ChevronRight, CircleAlert, CirclePlus, Dumbbell, Image as ImageIcon, ImagePlus, Trash2, X, type LucideIcon } from "lucide-react";

import { HighlightedBody } from "@/components/ui/HighlightedBody";
import { MuscleLegend, PRIMARY_MUSCLE_COLOR, SECONDARY_MUSCLE_COLOR } from "@/components/ui/MuscleLegend";
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
import { characterCount } from "@/lib/domain/format";
import { exerciseTrackedMetrics, SET_METRIC_NAMES } from "@/lib/domain/set-metric";
import { createExercise, deleteExercise, updateExercise } from "@/lib/repo";
import { useEquipment, useExerciseInScheme, useExerciseInUse, useExercises, useMuscleGroups, useMuscles, useReferenceData } from "@/lib/repo/hooks";
import { SET_METRICS, type Exercise, type Muscle, type SetMetric } from "@/types/models";
import { ActionSheet, type ActionSheetButton } from "@/components/ui/ActionSheet";
import { Alert } from "@/components/ui/Alert";
import { ButtonRow, FormRow, FormSection, FormStack, PressableRow } from "@/components/ui/Form";
import { ExerciseImages, exerciseImageItems, prepareExerciseImage } from "./exercise-image";
import { FullScreenCover, Sheet, SheetButton } from "@/components/ui/overlay";

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
    <FullScreenCover open={open} onClose={onClose} label={exercise ? "Edit exercise" : "New exercise"} grouped>
      <ExerciseForm exercise={exercise} onClose={onClose} onDeleted={onDeleted} />
    </FullScreenCover>
  );
}

type Picker = "equipment" | "muscleGroup" | "photo";
type MuscleRole = "primary" | "secondary";

const RED = "text-[#ff3b30] dark:text-[#ff453a]";

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
  const [musclePicker, setMusclePicker] = useState<MuscleRole | null>(null);
  const [alert, setAlert] = useState<"delete" | "nonDeletable" | "inScheme" | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const filesInput = useRef<HTMLInputElement>(null);

  const trimmedName = name.trim();
  const trimmedNewAlias = newAlias.trim();
  const trimmedDescription = description.trim();
  const nameProblem = exerciseNameProblem(trimmedName, { missingSelectionWarning, nameTakenWarning });
  const aliasProblem = aliasProblemOf(trimmedNewAlias);
  const descriptionProblem = descriptionProblemOf(trimmedDescription);

  // The set data of performed workouts depends on the tracked metrics, so they are fixed once the exercise was performed
  const canChangeTrackedMetrics = exercise ? inUse !== undefined && exerciseCanChangeTrackedMetrics(exercise, inUse) : true;

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
    const typedAliasProblem = added ? null : aliasProblemOf(trimmedNewAlias);
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

  // a muscle is either primary or secondary, the server refuses it in both lists
  const toggleMuscle = (role: MuscleRole, id: number) => {
    const [selected, setSelected, setOther] =
      role === "primary" ? [primaryIds, setPrimaryIds, setSecondaryIds] : [secondaryIds, setSecondaryIds, setPrimaryIds];
    if (selected.includes(id)) {
      setSelected((ids) => ids.filter((other) => other !== id));
    } else {
      setSelected((ids) => [...ids, id]);
      setOther((ids) => ids.filter((other) => other !== id));
    }
  };

  const pickers: Record<Picker, { title: string; message: string; buttons: ActionSheetButton[] }> = {
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
      title: "Muscle group",
      message: "Select the most important muscle group for this exercise",
      buttons: (allMuscleGroups ?? []).map((group) => ({ label: group.name, onSelect: () => setMuscleGroupId(group.serverId) })),
    },
    photo: {
      title: "Add images",
      message: "Take a photo of the exercise or choose some, e.g. one per step of the movement",
      buttons: [
        { label: "Take photo", onSelect: () => cameraInput.current?.click() },
        { label: "Choose photos", onSelect: () => filesInput.current?.click() },
      ],
    },
  };

  const muscleCount = (ids: number[]) => (ids.length === 0 ? "None" : `${ids.length}`);
  const metricsMissing = missingSelectionWarning && trackedMetrics.length === 0;

  return (
    <div className="flex flex-col [--placeholder:rgba(60,60,67,0.3)] dark:[--placeholder:rgba(235,235,245,0.3)]">
      <header className="sticky top-0 z-10 flex h-11 shrink-0 items-center justify-between bg-grouped/90 px-4 backdrop-blur-xl">
        <SheetButton onClick={onClose} className="z-10">
          Cancel
        </SheetButton>
        <h1 className="absolute inset-x-24 truncate text-center text-headline font-semibold">{exercise ? "Edit exercise" : "New exercise"}</h1>
        <SheetButton bold onClick={() => void save()} className="z-10">
          Save
        </SheetButton>
      </header>

      <FormStack>
        <FormSection header={`Images · ${imageCount}/${EXERCISE_LIMITS.images}`} plain>
          <div className={`relative w-full overflow-hidden rounded-[20px] bg-field/30 ${imageCount === 0 ? "aspect-[2/1]" : "aspect-square"}`}>
            <ExerciseImages
              images={exerciseImageItems(imageUrls, photos)}
              placeholder={<ImageIcon size={34} className="text-secondary-label" aria-hidden />}
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
                          className="flex h-full w-full flex-col items-center justify-center gap-2 text-app active:opacity-60"
                        >
                          <ImagePlus size={34} aria-hidden />
                          <span className="text-subheadline font-medium">{imageCount > 0 ? "Add more images" : "Add images"}</span>
                          {imageCount === 0 && <span className="text-caption1 text-secondary-label">e.g. one per step of the movement</span>}
                        </button>
                      ),
                    }
                  : undefined
              }
            />
          </div>
          <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={(event) => void pickPhotos(event.currentTarget)} />
          <input ref={filesInput} type="file" accept="image/*" multiple hidden onChange={(event) => void pickPhotos(event.currentTarget)} />
        </FormSection>

        <FormSection header="Name" footer={nameProblem && <ProblemText>{nameProblem}</ProblemText>}>
          <FormRow className="py-0" rowClassName="focus-ring-within rounded-[20px]">
            <input
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setNameTakenWarning(false);
              }}
              placeholder="e.g. Bench press"
              aria-label="Name"
              autoCorrect="off"
              autoComplete="off"
              enterKeyHint="done"
              className={`h-12 w-full min-w-0 bg-transparent text-title3 font-semibold outline-none placeholder:font-normal placeholder:text-[var(--placeholder)] ${
                nameProblem ? RED : ""
              }`}
            />
          </FormRow>
        </FormSection>

        {/* Other names like "Military press" for "Barbell shoulder press", so that the exercise is found by them */}
        <FormSection
          header="Also known as"
          footer={aliasProblem ? <ProblemText>{aliasProblem}</ProblemText> : "Only used to find the exercise when searching."}
        >
          {aliases.length > 0 && (
            <FormRow>
              <div className="flex flex-wrap gap-1.5">
                {aliases.map((alias) => (
                  <button
                    key={alias}
                    type="button"
                    onClick={() => setAliases((list) => list.filter((other) => other !== alias))}
                    className="flex items-center gap-1 rounded-full bg-field/40 px-2.5 py-[5px] text-subheadline active:opacity-60"
                    aria-label={`Remove ${alias}`}
                  >
                    {alias}
                    <X size={12} strokeWidth={3} className="text-secondary-label" aria-hidden />
                  </button>
                ))}
              </div>
            </FormRow>
          )}
          {aliases.length < EXERCISE_LIMITS.aliasCount && (
            <FormRow className="py-0" rowClassName={`focus-ring-within ${aliases.length > 0 ? "rounded-b-[20px]" : "rounded-[20px]"}`}>
              <input
                value={newAlias}
                onChange={(event) => setNewAlias(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submitAlias();
                  }
                }}
                placeholder="Add another name"
                aria-label="Add another name"
                autoCorrect="off"
                autoComplete="off"
                enterKeyHint="done"
                className={`h-11 min-w-0 flex-1 bg-transparent outline-none placeholder:text-[var(--placeholder)] ${aliasProblem ? RED : ""}`}
              />
              <button
                type="button"
                aria-label="Add name"
                onClick={submitAlias}
                disabled={trimmedNewAlias === "" || aliasProblem !== null}
                className="-mr-1 flex h-11 w-9 items-center justify-center text-app active:opacity-50 disabled:text-tab-inactive"
              >
                <CirclePlus size={24} aria-hidden />
              </button>
            </FormRow>
          )}
        </FormSection>

        <FormSection
          header="Description"
          footer={
            <div className="flex items-start gap-2">
              {descriptionProblem && <ProblemText>{descriptionProblem}</ProblemText>}
              <span className="ml-auto tabular-nums">
                {characterCount(trimmedDescription)}/{EXERCISE_LIMITS.description}
              </span>
            </div>
          }
        >
          <FormRow rowClassName="focus-ring-within rounded-[20px]">
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="How is it done? What should you look out for?"
              aria-label="Description"
              rows={4}
              // grows with the text like `.lineLimit(4...12)`
              className="max-h-[12lh] min-h-[4lh] w-full resize-none bg-transparent outline-none [field-sizing:content] placeholder:text-[var(--placeholder)]"
            />
          </FormRow>
        </FormSection>

        <FormSection header="Muscles">
          <FormRow className="gap-4 py-3">
            <HighlightedBody className="h-[170px] shrink-0" primaryMuscles={primaryMuscles} secondaryMuscles={secondaryMuscles} />
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <MuscleLegend color={PRIMARY_MUSCLE_COLOR} title="Main" muscles={primaryMuscles} />
              <MuscleLegend color={SECONDARY_MUSCLE_COLOR} title="Also" muscles={secondaryMuscles} />
            </div>
          </FormRow>
          <ValueRow title="Main muscles" dotColor={PRIMARY_MUSCLE_COLOR} value={muscleCount(primaryIds)} onClick={() => setMusclePicker("primary")} />
          <ValueRow
            title="Secondary muscles"
            dotColor={SECONDARY_MUSCLE_COLOR}
            value={muscleCount(secondaryIds)}
            onClick={() => setMusclePicker("secondary")}
          />
        </FormSection>

        <FormSection header="Details">
          <ValueRow
            title="Muscle group"
            icon={BicepsFlexed}
            value={muscleGroupId === null ? "Select" : (reference?.muscleGroups.get(muscleGroupId)?.name ?? "")}
            isMissing={missingSelectionWarning && muscleGroupId === null}
            onClick={() => setPicker("muscleGroup")}
          />
          <ValueRow
            title="Equipment"
            icon={Dumbbell}
            value={equipmentId === null ? "Select" : (reference?.equipment.get(equipmentId)?.name ?? "")}
            isMissing={missingSelectionWarning && equipmentId === null}
            onClick={() => setPicker("equipment")}
          />
        </FormSection>

        <FormSection
          header={<span className={metricsMissing ? RED : ""}>Tracked per set</span>}
          footer={
            !canChangeTrackedMetrics ? (
              "You have already done a workout with this exercise, so the tracked values can't be changed."
            ) : metricsMissing ? (
              <ProblemText>Select at least one value.</ProblemText>
            ) : undefined
          }
        >
          <FormRow>
            <div className="flex flex-wrap gap-2">
              {SET_METRICS.map((metric) => {
                const selected = trackedMetrics.includes(metric);
                return (
                  <button
                    key={metric}
                    type="button"
                    aria-pressed={selected}
                    disabled={!canChangeTrackedMetrics}
                    onClick={() => toggleMetric(metric)}
                    className={`flex items-center gap-1 rounded-full px-3 py-[7px] text-subheadline font-medium active:opacity-60 disabled:opacity-50 disabled:active:opacity-50 ${
                      selected ? "bg-app text-white" : "bg-field/40"
                    }`}
                  >
                    {selected && <Check size={14} strokeWidth={3} aria-hidden />}
                    {SET_METRIC_NAMES[metric]}
                  </button>
                );
              })}
            </div>
          </FormRow>
        </FormSection>

        {exercise && (
          <FormSection>
            <ButtonRow
              destructive
              // like the server, it can't be deleted while a workout or a workout scheme contains it
              onClick={() => setAlert(inUse ? "nonDeletable" : inScheme ? "inScheme" : "delete")}
              disabled={inUse === undefined || inScheme === undefined}
            >
              <Trash2 size={20} aria-hidden />
              Delete exercise
            </ButtonRow>
          </FormSection>
        )}
      </FormStack>

      {picker && (
        <ActionSheet
          open
          title={pickers[picker].title}
          message={pickers[picker].message}
          buttons={pickers[picker].buttons}
          onClose={() => setPicker(null)}
        />
      )}

      <MusclePicker
        role={musclePicker}
        allMuscles={allMuscles ?? []}
        selected={musclePicker === "secondary" ? secondaryIds : primaryIds}
        onToggle={(id) => musclePicker && toggleMuscle(musclePicker, id)}
        onClose={() => setMusclePicker(null)}
      />

      <Alert
        open={alert === "nonDeletable" || alert === "inScheme"}
        title="You can't delete this exercise"
        message={
          alert === "inScheme"
            ? "This exercise is part of a workout scheme. Remove it from the scheme first to delete it."
            : "You have already done a workout with this exercise. Therefore it can't be deleted."
        }
        buttons={[{ label: "Got it", role: "cancel" }]}
        onClose={() => setAlert(null)}
      />
      <Alert
        open={alert === "delete"}
        title="Delete this exercise?"
        message="It can't be recovered."
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
          { label: "Cancel", role: "cancel" },
        ]}
        onClose={() => setAlert(null)}
      />
    </div>
  );
}

/** A row that opens a choice, with the chosen value on the right, red while it's missing (FormValueRow) */
function ValueRow({
  title,
  icon: Icon,
  dotColor,
  value,
  isMissing = false,
  onClick,
}: {
  title: string;
  icon?: LucideIcon;
  /** the dot of the muscle legend instead of an icon */
  dotColor?: string;
  value: string;
  isMissing?: boolean;
  onClick: () => void;
}) {
  return (
    <PressableRow onClick={onClick} aria-label={`${title}, ${value}`}>
      <span className="flex w-6 shrink-0 justify-center" aria-hidden>
        {Icon ? <Icon size={20} className="text-app" /> : <span className="size-2.5 rounded-full" style={{ backgroundColor: dotColor }} />}
      </span>
      <span className={`flex-1 ${isMissing ? RED : ""}`}>{title}</span>
      <span className={`min-w-0 truncate ${isMissing ? RED : "text-secondary-label"}`}>{value}</span>
      <ChevronRight size={18} strokeWidth={2.5} className="-mr-1 shrink-0 text-tab-inactive/70" aria-hidden />
    </PressableRow>
  );
}

/** A problem of the input below its field */
function ProblemText({ children }: { children: ReactNode }) {
  return (
    <span className={`flex items-start gap-1 ${RED}`}>
      <CircleAlert size={14} strokeWidth={2.5} className="mt-px shrink-0" aria-hidden />
      {children}
    </span>
  );
}

/**
 * All muscles with a checkmark at the selected ones, tapping one adds or removes it. A muscle added here is removed
 * from the muscles of the other role.
 */
function MusclePicker({
  role,
  allMuscles,
  selected,
  onToggle,
  onClose,
}: {
  role: MuscleRole | null;
  allMuscles: readonly Muscle[];
  selected: readonly number[];
  onToggle: (id: number) => void;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={role !== null}
      onClose={onClose}
      title={role === "secondary" ? "Secondary muscles" : "Main muscles"}
      trailing={
        <SheetButton bold onClick={onClose}>
          Done
        </SheetButton>
      }
      grouped
      overCover
    >
      <FormStack>
        <FormSection>
          {allMuscles.map((muscle) => {
            const isSelected = selected.includes(muscle.serverId);
            return (
              <PressableRow key={muscle.serverId} aria-pressed={isSelected} onClick={() => onToggle(muscle.serverId)}>
                <span className="flex-1">{muscle.name}</span>
                {isSelected && <Check size={20} strokeWidth={2.5} className="text-app" aria-hidden />}
              </PressableRow>
            );
          })}
        </FormSection>
      </FormStack>
    </Sheet>
  );
}
