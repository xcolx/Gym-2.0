"use client";

// Port of ios/Gym 2.0/Features/Workout/Exercises/ExerciseDetailView.swift

import { useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, Image as ImageIcon, Plus, Sparkles } from "lucide-react";

import { ExerciseName } from "@/components/ui/ExerciseName";
import { HighlightedBody } from "@/components/ui/HighlightedBody";
import { MuscleLegend, PRIMARY_MUSCLE_COLOR, SECONDARY_MUSCLE_COLOR } from "@/components/ui/MuscleLegend";
import { BottomActionBar, PrimaryButton } from "@/components/ui/PrimaryButton";
import { exerciseCanEdit, exerciseTrackedMetrics } from "@/lib/domain/exercise";
import { SET_METRIC_NAMES } from "@/lib/domain/set-metric";
import { exerciseDetailsText, musclesWorked } from "@/lib/domain/workout-setup";
import { useExercise, useMuscles, useReferenceData } from "@/lib/repo/hooks";
import type { Exercise, LocalId } from "@/types/models";
import { CreateExercise } from "./CreateExercise";
import { ExerciseImages, exerciseImageItems } from "./exercise-image";

/**
 * The images, the muscles, the description and the tracked values of an exercise. In the exercise picker the bottom
 * bar adds it (once more) to the picked ones; without `onAdd` (e.g. in the performing workout, where it's already part
 * of it) there is none.
 */
export function ExerciseDetail({
  exerciseId,
  backLabel,
  onBack,
  onAdd,
  pickedCount = 0,
}: {
  exerciseId: LocalId;
  backLabel: string;
  onBack: () => void;
  onAdd?: (exercise: Exercise) => void;
  /** How often it's already picked */
  pickedCount?: number;
}) {
  const exercise = useExercise(exerciseId);
  const reference = useReferenceData();
  const muscles = useMuscles();
  const [editing, setEditing] = useState(false);

  // deleted, also on another device: back to the list
  useEffect(() => {
    if (exercise === null) onBack();
  }, [exercise, onBack]);

  if (!exercise) return null;

  const worked = musclesWorked([exercise], muscles ?? []);
  const description = exercise.exerciseDescription?.trim();
  const images = exerciseImageItems(exercise.imageUrls, exercise.pendingImages);
  const details = reference ? exerciseDetailsText(exercise, reference) : "";

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-grouped">
      <header className="relative flex h-11 shrink-0 items-center justify-between px-2">
        <button type="button" onClick={onBack} className="z-10 flex h-11 items-center pr-2 text-body text-app active:opacity-50">
          <ChevronLeft size={30} strokeWidth={2.25} className="-mr-0.5" aria-hidden />
          {backLabel}
        </button>
        <h1 className="absolute inset-x-28 truncate text-center text-headline font-semibold">{exercise.name}</h1>
        {/* verified exercises can't be changed */}
        {exerciseCanEdit(exercise) && (
          <button type="button" onClick={() => setEditing(true)} className="z-10 px-2 text-body text-app active:opacity-50">
            Edit
          </button>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 *:shrink-0 pb-6 pt-2">
        <div className={`relative w-full overflow-hidden rounded-[20px] bg-cell ${images.length === 0 ? "aspect-[2/1]" : "aspect-square"}`}>
          <ExerciseImages
            images={images}
            placeholder={
              <span className="flex h-full w-full flex-col items-center justify-center gap-2 bg-field/30 text-secondary-label">
                <ImageIcon size={34} aria-hidden />
                <span className="text-subheadline">No images yet</span>
              </span>
            }
          />
          {/* the images of verified exercises are generated */}
          {exercise.verified && images.length > 0 && <AIImageTag />}
        </div>

        <div className="flex flex-col gap-1 px-1">
          <ExerciseName name={exercise.name} verified={exercise.verified} className="break-words text-title2 font-bold" />
          {details && <p className="text-subheadline text-secondary-label">{details}</p>}
          {exercise.aliases.length > 0 && (
            <div className="flex flex-col gap-1.5 pt-2" aria-label={`Also known as ${exercise.aliases.join(", ")}`}>
              <span className="text-caption1 font-semibold text-secondary-label" aria-hidden>
                Also known as
              </span>
              <div className="flex flex-wrap gap-1.5" aria-hidden>
                {exercise.aliases.map((alias) => (
                  <span key={alias} className="rounded-full bg-field/40 px-2.5 py-[5px] text-subheadline">
                    {alias}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <DetailCard title="Muscles">
          <div className="flex items-center gap-4">
            <HighlightedBody className="h-[190px] shrink-0" primaryMuscles={worked.primary} secondaryMuscles={worked.secondary} />
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <MuscleLegend color={PRIMARY_MUSCLE_COLOR} title="Main" muscles={worked.primary} />
              {worked.secondary.length > 0 && <MuscleLegend color={SECONDARY_MUSCLE_COLOR} title="Also" muscles={worked.secondary} />}
            </div>
          </div>
        </DetailCard>

        <DetailCard title="How to">
          {description ? (
            <p className="whitespace-pre-wrap break-words text-subheadline">{description}</p>
          ) : (
            <p className="text-subheadline text-secondary-label">No description yet.</p>
          )}
        </DetailCard>

        <DetailCard title="Tracked per set">
          <div className="flex flex-wrap gap-2">
            {exerciseTrackedMetrics(exercise).map((metric) => (
              <span key={metric} className="rounded-full bg-app/15 px-3 py-1.5 text-subheadline font-medium text-app">
                {SET_METRIC_NAMES[metric]}
              </span>
            ))}
          </div>
        </DetailCard>
      </div>

      {onAdd && (
        <BottomActionBar inSheet>
          <PrimaryButton onClick={() => onAdd(exercise)}>
            <Plus size={20} strokeWidth={2.5} className="mr-1.5" aria-hidden />
            {pickedCount === 0 ? "Add to workout" : `Add again (${pickedCount + 1}×)`}
          </PrimaryButton>
        </BottomActionBar>
      )}

      <CreateExercise open={editing} exercise={exercise} onClose={() => setEditing(false)} onDeleted={onBack} />
    </div>
  );
}

function DetailCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card flex flex-col gap-2.5 p-4">
      <h2 className="text-headline font-semibold">{title}</h2>
      {children}
    </section>
  );
}

const AI_IMAGE_NOTE = "The form isn't necessarily completely correct. It's only here to give you a general idea of the movement.";

/** AIImageTag of ExerciseDetailView.swift: marks the images of verified exercises as generated, a tap shows the note */
function AIImageTag() {
  const [showsNote, setShowsNote] = useState(false);
  return (
    <div className="absolute left-2.5 top-2.5 z-10 flex max-w-[calc(100%-20px)] flex-col items-start gap-1.5">
      <button
        type="button"
        aria-expanded={showsNote}
        aria-label={`AI-generated image. ${AI_IMAGE_NOTE}`}
        onClick={() => setShowsNote((shown) => !shown)}
        className="flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-[5px] text-caption1 font-semibold text-white active:opacity-70"
      >
        <Sparkles size={12} className="fill-current" aria-hidden />
        AI image
      </button>
      {showsNote && (
        <p className="w-[260px] max-w-full rounded-xl bg-cell p-3 text-subheadline text-secondary-label shadow-lg" aria-hidden>
          <span className="mb-1 flex items-center gap-1 text-headline font-semibold text-foreground">
            <Sparkles size={15} className="fill-current" />
            AI-generated image
          </span>
          {AI_IMAGE_NOTE}
        </p>
      )}
    </div>
  );
}
