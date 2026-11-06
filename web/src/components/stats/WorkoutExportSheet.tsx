"use client";

import { Download, Share } from "lucide-react";
import { useState } from "react";

import { appColorForeground } from "@/lib/app-color";
import { EXPORT_FORMATS, exportFileName, exportWorkouts, type ExportFormat } from "@/lib/domain/workout-file";
import type { WorkoutWithExercises } from "@/types/models";
import { AppColorSegmentedPicker } from "@/components/ui/AppColorSegmentedPicker";
import { ButtonRow, FormRow, FormSection, FormStack, LabeledRow } from "@/components/ui/Form";
import { Sheet, SheetButton } from "@/components/ui/overlay";
import { canShareFile, downloadFile, shareOrDownloadFile } from "./share";

/**
 * Port of WorkoutExportView.swift: exports the finished workouts as a file that can be shared or saved, and imported
 * again. "Export as …" opens the share sheet where the browser can share files (Android Chrome), and downloads the
 * file otherwise; with a share sheet, "Save to device" downloads it as well.
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
      title="Export workouts"
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

  return (
    <FormStack>
      <FormSection
        footer={`${option.explanation} Weights are in kg, times in seconds and distances in meters, so the file can be imported again on any device.`}
      >
        <LabeledRow label="Workouts" value={workouts.length} />
        <FormRow>
          <div className="w-full">
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
        </FormRow>
      </FormSection>

      <FormSection>
        {errorMessage ? (
          <FormRow className="text-[#ff3b30] dark:text-[#ff453a]">{errorMessage}</FormRow>
        ) : (
          <>
            <ButtonRow
              disabled={disabled}
              onClick={() => {
                const file = makeFile();
                if (file) void shareOrDownloadFile(file);
              }}
            >
              <Share size={20} aria-hidden />
              Export as {option.title}
            </ButtonRow>
            {probe && (
              <ButtonRow
                disabled={disabled}
                onClick={() => {
                  const file = makeFile();
                  if (file) downloadFile(file);
                }}
              >
                <Download size={20} aria-hidden />
                Save to device
              </ButtonRow>
            )}
          </>
        )}
      </FormSection>
    </FormStack>
  );
}
