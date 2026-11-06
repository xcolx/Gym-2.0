"use client";

// The SwiftUI controls shared by every tab

import { LoaderCircle } from "lucide-react";

/**
 * `Toggle` with a hidden label: the iOS switch, in the app color when on (MainView tints the whole app with it).
 * `label` is for screen readers.
 */
export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      // A 44 px touch target without making the row higher
      className="relative flex h-[31px] shrink-0 items-center after:absolute after:-inset-[7px] after:content-[''] disabled:opacity-50"
    >
      <span
        className={`relative inline-block h-[31px] w-[51px] rounded-full transition-colors duration-200 ${
          checked ? "bg-app" : "bg-[#e9e9ea] dark:bg-[#39393d]"
        }`}
      >
        <span
          className={`absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,0.15),0_1px_1px_rgba(0,0,0,0.16)] transition-[left] duration-200 ${
            checked ? "left-[22px]" : "left-[2px]"
          }`}
        />
      </span>
    </button>
  );
}

/** `ProgressView()`: a small spinning indicator */
export function Spinner({ size = 20, className = "" }: { size?: number; className?: string }) {
  return <LoaderCircle size={size} className={`shrink-0 animate-spin text-secondary-label ${className}`} aria-label="Loading" role="progressbar" />;
}
