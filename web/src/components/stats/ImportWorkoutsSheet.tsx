"use client";

import { ArrowLeftRight, CircleCheck, CircleEqual, FilePlus, History, OctagonX, TriangleAlert, type LucideIcon } from "lucide-react";
import { useRef, useState } from "react";

import type { LegacyWorkoutImportPlan } from "@/lib/domain/legacy-workout-import";
import {
  readLegacyWorkoutFile,
  readWorkoutFile,
  WorkoutFileError,
  type WorkoutImportPlan,
} from "@/lib/domain/workout-file";
import { importWorkouts, planImportOfWorkoutFile, planLegacyImportOfWorkoutFile } from "@/lib/repo";
import { Alert } from "@/components/ui/Alert";
import { ButtonRow, FormRow, FormSection, FormStack } from "@/components/ui/Form";
import { Sheet, SheetButton } from "@/components/ui/overlay";

/** The files of the export (JSON or CSV) and the CSV files of earlier versions (`allowedContentTypes`) */
const ACCEPT = ".json,.csv,.txt,application/json,text/csv,text/comma-separated-values,text/plain";
/** The CSV files of earlier versions, for the legacy import */
const LEGACY_ACCEPT = ".csv,.txt,text/csv,text/comma-separated-values,text/plain";

/** Port of ImportWorkoutsView.swift with ImportWorkoutsViewModel.swift */
export function ImportWorkoutsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Import workouts"
      trailing={
        <SheetButton bold onClick={onClose}>
          Done
        </SheetButton>
      }
      grouped
    >
      {/* A new state every time it is shown, like the @State of the sheet */}
      {open && <ImportWorkouts />}
    </Sheet>
  );
}

function ImportWorkouts() {
  const input = useRef<HTMLInputElement>(null);
  const legacyInput = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [plan, setPlan] = useState<WorkoutImportPlan | null>(null);
  // Set for the legacy import, the same object as `plan`
  const [legacyPlan, setLegacyPlan] = useState<LegacyWorkoutImportPlan | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  // Shown after the import was confirmed, until another file is picked
  const [importedCount, setImportedCount] = useState<number | null>(null);

  const importFile = async (file: File, legacy: boolean) => {
    setImportError(null);
    setPlan(null);
    setLegacyPlan(null);
    setImportedCount(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let result: WorkoutImportPlan;
      if (legacy) {
        const legacyResult = await planLegacyImportOfWorkoutFile(readLegacyWorkoutFile(bytes));
        setLegacyPlan(legacyResult);
        result = legacyResult;
      } else {
        result = await planImportOfWorkoutFile(readWorkoutFile(file.name, bytes));
      }
      setPlan(result);
      if (result.workouts.length === 0) {
        setImportError("The file doesn't contain any new workouts.");
      } else {
        setShowConfirmation(true);
      }
    } catch (error) {
      setImportError(error instanceof WorkoutFileError || error instanceof Error ? error.message : String(error));
    }
  };

  const confirmImport = async () => {
    if (!plan) return;
    const workouts = plan.workouts;
    // The messages stay, only the workouts to import are cleared
    setPlan({ ...plan, workouts: [] });
    if (legacyPlan) setLegacyPlan({ ...legacyPlan, workouts: [] });
    try {
      await importWorkouts(workouts);
      setImportedCount(workouts.length);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : String(error));
    }
  };

  const numImported = plan?.workouts.length ?? 0;
  const existing = plan?.existingCount ?? 0;
  const results = [
    importedCount !== null && {
      key: "imported",
      icon: CircleCheck,
      color: "text-[#34c759] dark:text-[#30d158]",
      text: importedCount === 1 ? "1 workout imported" : `${importedCount} workouts imported`,
    },
    importError && { key: "error", icon: OctagonX, color: "text-[#ff3b30] dark:text-[#ff453a]", text: importError },
    existing > 0 && {
      key: "existing",
      icon: CircleEqual,
      color: "text-secondary-label",
      text: existing === 1 ? "1 workout exists already and is skipped." : `${existing} workouts exist already and are skipped.`,
    },
    legacyPlan &&
      legacyPlan.renamedExercises.length > 0 && {
        key: "renamed",
        icon: ArrowLeftRight,
        color: "text-secondary-label",
        text: `Matched: ${legacyPlan.renamedExercises.map((match) => `${match.legacyName} → ${match.exerciseName}`).join(", ")}`,
      },
    legacyPlan &&
      legacyPlan.unmatchedExerciseNames.length > 0 && {
        key: "unmatched",
        icon: TriangleAlert,
        color: "text-[#ff9500] dark:text-[#ff9f0a]",
        text: `${legacyPlan.unmatchedWorkoutCount} workouts are skipped, these exercises could not be matched: ${legacyPlan.unmatchedExerciseNames.join(", ")}`,
      },
    plan &&
      plan.missingExerciseNames.length > 0 && {
        key: "missing",
        icon: TriangleAlert,
        color: "text-[#ff9500] dark:text-[#ff9f0a]",
        text: `Skipped, these exercises don't exist: ${plan.missingExerciseNames.join(", ")}`,
      },
    plan &&
      plan.invalidWorkouts.length > 0 && {
        key: "invalid",
        icon: TriangleAlert,
        color: "text-[#ff9500] dark:text-[#ff9f0a]",
        text: `Skipped, values out of range or more than 100 sets or exercises: ${plan.invalidWorkouts.join(", ")}`,
      },
  ].filter((result): result is { key: string; icon: LucideIcon; color: string; text: string } => !!result);

  return (
    <FormStack>
      <FormSection footer="A JSON or CSV file exported from Gym 2.0. Workouts that exist already are skipped.">
        <ButtonRow onClick={() => input.current?.click()}>
          <FilePlus size={20} aria-hidden />
          Choose a Gym 2.0 file
        </ButtonRow>
      </FormSection>

      <FormSection footer="A CSV file of an earlier version of the app. Its exercises are matched to the current ones by name.">
        <ButtonRow onClick={() => legacyInput.current?.click()}>
          <History size={20} aria-hidden />
          Import from an earlier version
        </ButtonRow>
      </FormSection>

      {results.length > 0 && (
        <FormSection header="Result">
          {results.map(({ key, icon: Icon, color, text }) => (
            <FormRow key={key} className="items-start">
              <Icon size={20} className={`mt-px shrink-0 ${color}`} aria-hidden />
              <span className="min-w-0 flex-1 break-words text-subheadline">{text}</span>
            </FormRow>
          ))}
        </FormSection>
      )}

      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="hidden"
        aria-label="Workout file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Cleared, so the same file can be selected again
          event.target.value = "";
          if (file) void importFile(file, false);
        }}
      />
      <input
        ref={legacyInput}
        type="file"
        accept={LEGACY_ACCEPT}
        className="hidden"
        aria-label="Legacy workout file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void importFile(file, true);
        }}
      />

      <Alert
        open={showConfirmation}
        title={
          legacyPlan
            ? `Import ${numImported} of ${legacyPlan.totalCount} workouts?`
            : numImported === 1
              ? "Import 1 workout?"
              : `Import ${numImported} workouts?`
        }
        message={
          legacyPlan
            ? "The other workouts contain exercises that could not be matched or exist already. This can't be undone."
            : "This can't be undone."
        }
        buttons={[
          { label: "Cancel", role: "cancel" },
          { label: "Import", isDefault: true, onSelect: () => void confirmImport() },
        ]}
        onClose={() => setShowConfirmation(false)}
      />
    </FormStack>
  );
}
