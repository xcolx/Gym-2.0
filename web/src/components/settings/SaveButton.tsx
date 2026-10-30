"use client";

import { Spinner } from "@/components/ui/controls";
import { FormSection } from "@/components/ui/Form";

/** The way back from the account screens to the settings */
export const SETTINGS_BACK = { href: "/settings", label: "Settings" } as const;

/** SaveButton of AccountSettingsView.swift: a section with "Save" and a spinner while saving. Submits its form. */
export function SaveButton({ isSaving, disabled, onClick }: { isSaving: boolean; disabled: boolean; onClick?: () => void }) {
  return (
    <FormSection>
      <button
        type={onClick ? "button" : "submit"}
        disabled={disabled}
        onClick={onClick}
        className="block w-full pl-4 text-left active:bg-field/40 disabled:active:bg-transparent"
      >
        <span className={`flex min-h-11 items-center gap-3 py-2.5 pr-4 text-app ${disabled && !isSaving ? "opacity-40" : ""}`}>
          <span className="flex-1">Save</span>
          {isSaving && <Spinner />}
        </span>
      </button>
    </FormSection>
  );
}
