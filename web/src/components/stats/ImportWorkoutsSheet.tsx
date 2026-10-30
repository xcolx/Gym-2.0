"use client";

import { History, Inbox } from "lucide-react";
import { useRef, useState } from "react";

import { appColorForeground } from "@/lib/app-color";
import type { LegacyWorkoutImportPlan } from "@/lib/domain/legacy-workout-import";
import {
  readLegacyWorkoutFile,
  readWorkoutFile,
  WorkoutFileError,
  type WorkoutImportPlan,
} from "@/lib/domain/workout-file";
import { importWorkouts, planImportOfWorkoutFile, planLegacyImportOfWorkoutFile } from "@/lib/repo";
import { Alert } from "@/components/ui/Alert";
import { Sheet, SheetButton } from "@/components/ui/overlay";

/** The files of the export (JSON or CSV) and the CSV files of earlier versions (`allowedContentTypes`) */
const ACCEPT = ".json,.csv,.txt,application/json,text/csv,text/comma-separated-values,text/plain";
/** The CSV files of earlier versions, for the legacy import */
const LEGACY_ACCEPT = ".csv,.txt,text/csv,text/comma-separated-values,text/plain";

/** Port of ImportWorkoutsView.swift with ImportWorkoutsViewModel.swift */
export function ImportWorkoutsSheet({
  open,
  onClose,
  appColor,
}: {
  open: boolean;
  onClose: () => void;
  appColor: string;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      label="Import Workouts"
      // iOS closes it by swiping down
      trailing={
        <SheetButton bold onClick={onClose}>
          Done
        </SheetButton>
      }
    >
      {/* A new state every time it is shown, like the @StateObject of the sheet */}
      {open && <ImportWorkouts appColor={appColor} />}
    </Sheet>
  );
}

function ImportWorkouts({ appColor }: { appColor: string }) {
  const input = useRef<HTMLInputElement>(null);
  const legacyInput = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [plan, setPlan] = useState<WorkoutImportPlan | null>(null);
  // Set for the legacy import, the same object as `plan`
  const [legacyPlan, setLegacyPlan] = useState<LegacyWorkoutImportPlan | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const importFile = async (file: File, legacy: boolean) => {
    setImportError(null);
    setPlan(null);
    setLegacyPlan(null);
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
    } catch (error) {
      setImportError(error instanceof Error ? error.message : String(error));
    }
  };

  const numImported = plan?.workouts.length ?? 0;

  return (
    <>
      <div className="flex flex-col items-center gap-[30px] px-4 text-center">
        <h2 className="pt-4 text-title">Import Workouts</h2>

        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            className="flex items-center gap-2 rounded-[10px] bg-app px-4 py-[7px] text-body font-semibold active:opacity-70"
            style={{ color: appColorForeground(appColor) }}
            onClick={() => input.current?.click()}
          >
            <Inbox size={20} />
            Select File
          </button>
          <button
            type="button"
            className={
              "flex items-center gap-2 rounded-[10px] bg-app/15 px-4 py-[7px] text-body font-semibold text-app " +
              "active:opacity-70"
            }
            onClick={() => legacyInput.current?.click()}
          >
            <History size={20} />
            Legacy Import
          </button>
        </div>
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

        {importError && <p className="text-[#ff3b30]">Error: {importError}</p>}

        <p className="text-footnote text-secondary-label">
          Select a JSON or CSV file exported from Gym 2.0. Use Legacy Import for a CSV file of an earlier version, its
          exercises are matched to the current ones by name.
        </p>

        {legacyPlan && legacyPlan.renamedExercises.length > 0 && (
          <p className="text-secondary-label">
            Matched exercises:{" "}
            {legacyPlan.renamedExercises.map((match) => `${match.legacyName} → ${match.exerciseName}`).join(", ")}
          </p>
        )}
        {legacyPlan && legacyPlan.unmatchedExerciseNames.length > 0 && (
          <p className="text-[#ff9500]">
            {legacyPlan.unmatchedWorkoutCount} workouts are not imported, since these exercises could not be
            matched:{" "}
            {legacyPlan.unmatchedExerciseNames.join(", ")}
          </p>
        )}

        {plan && plan.existingCount > 0 && (
          <p className="text-secondary-label">
            {plan.existingCount} workouts of the file exist already and are not imported again.
          </p>
        )}
        {plan && plan.missingExerciseNames.length > 0 && (
          <p className="text-[#ff9500]">
            Not imported, since these exercises do not exist: {plan.missingExerciseNames.join(", ")}
          </p>
        )}
        {plan && plan.invalidWorkouts.length > 0 && (
          <p className="text-[#ff9500]">
            Not imported, since they contain values that are out of range or more than 100 sets or exercises:{" "}
            {plan.invalidWorkouts.join(", ")}
          </p>
        )}
      </div>

      <Alert
        open={showConfirmation}
        title={
          legacyPlan
            ? `Do you want to import ${numImported}/${legacyPlan.totalCount} correctly mapped workouts?`
            : `Are you sure you want to import ${numImported} Workouts? This cannot be undone.`
        }
        message={
          legacyPlan
            ? "The other workouts contain exercises that could not be matched or exist already. This cannot be undone."
            : undefined
        }
        buttons={[
          { label: "Cancel", role: "cancel" },
          { label: "Import", role: "destructive", onSelect: () => void confirmImport() },
        ]}
        onClose={() => setShowConfirmation(false)}
      />
    </>
  );
}
