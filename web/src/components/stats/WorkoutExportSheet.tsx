"use client";

import { Download, Share } from "lucide-react";
import { useState } from "react";

import { appColorForeground } from "@/lib/app-color";
import { EXPORT_FORMATS, exportFileName, exportWorkouts, type ExportFormat } from "@/lib/domain/workout-file";
import type { WorkoutWithExercises } from "@/types/models";
import { AppColorSegmentedPicker } from "@/components/ui/AppColorSegmentedPicker";
import { Sheet, SheetButton } from "@/components/ui/overlay";
import { canShareFile, downloadFile, shareOrDownloadFile } from "./share";

/**
 * Port of WorkoutExportView.swift: exports the finished workouts as a file that can be shared or saved, and imported
 * again. "Export as …" opens the share sheet where the browser can share files (Android Chrome), and downloads the
 * file otherwise; with a share sheet, "Save to Device" downloads it as well.
 */
export function WorkoutExportSheet({
  open,
  onClose,
  workouts,
  appColor,
}: {
  open: boolean;
  onClose: () => void;
  workouts: readonly WorkoutWithExercises[];
  appColor: string;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      label="Export Workouts"
      title="Export Workouts"
      grouped
      trailing={
        <SheetButton bold onClick={onClose}>
          Done
        </SheetButton>
      }
    >
      {/* A new state every time it is shown, like the @State of the sheet */}
      {open && <WorkoutExport workouts={workouts} appColor={appColor} />}
    </Sheet>
  );
}

function WorkoutExport({ workouts, appColor }: { workouts: readonly WorkoutWithExercises[]; appColor: string }) {
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const option = EXPORT_FORMATS.find((item) => item.format === format)!;

  // Written when tapped: the share sheet only opens right after a tap
  const makeFile = (): File | null => {
    try {
      setErrorMessage(null);
      return new File([exportWorkouts(workouts, format)], exportFileName(format), { type: option.mimeType });
    } catch (error) {
      setErrorMessage(`The file could not be created: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  };
  const probe =
    typeof window === "undefined"
      ? false
      : canShareFile(new File([""], exportFileName(format), { type: option.mimeType }));
  const disabled = workouts.length === 0;
  const row = "flex w-full items-center gap-2 px-4 py-[11px] text-left text-app active:bg-field/40 disabled:opacity-40";

  return (
    <div className="px-4 pt-4">
      <div className="overflow-hidden rounded-[10px] bg-cell">
        <div className="ml-4 flex justify-between border-b border-separator py-[11px] pr-4">
          <span>Workouts</span>
          <span className="text-secondary-label">{workouts.length}</span>
        </div>
        <div className="px-4 py-2">
          <AppColorSegmentedPicker
            label="Format"
            options={EXPORT_FORMATS.map((item) => item.format)}
            title={(value) => EXPORT_FORMATS.find((item) => item.format === value)!.title}
            selection={format}
            onChange={(value) => {
              setFormat(value);
              setErrorMessage(null);
            }}
            selectedForeground={appColorForeground(appColor)}
          />
        </div>
      </div>
      <p className="px-4 pb-6 pt-1.5 text-footnote text-secondary-label">
        {option.explanation} Weights are in kg, times in seconds and distances in meters, so the file can be imported
        again on any device.
      </p>

      <div className="overflow-hidden rounded-[10px] bg-cell">
        {errorMessage ? (
          <p className="px-4 py-[11px] text-[#ff3b30]">{errorMessage}</p>
        ) : (
          <>
            <button
              type="button"
              className={row}
              disabled={disabled}
              onClick={() => {
                const file = makeFile();
                if (file) void shareOrDownloadFile(file);
              }}
            >
              <Share size={20} />
              Export as {option.title}
            </button>
            {probe && (
              <button
                type="button"
                className={`${row} border-t border-separator`}
                disabled={disabled}
                onClick={() => {
                  const file = makeFile();
                  if (file) downloadFile(file);
                }}
              >
                <Download size={20} />
                Save to Device
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
