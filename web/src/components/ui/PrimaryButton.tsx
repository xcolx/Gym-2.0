"use client";

import type { ComponentProps, ReactNode } from "react";

import { Spinner } from "@/components/ui/controls";

/** The look of PrimaryButtonStyle.swift, e.g. for a link that looks like the main button */
export const primaryButtonClass =
  "flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-app px-4 text-headline font-semibold text-app-foreground transition-[opacity,scale] duration-150 ease-out enabled:hover:opacity-90 enabled:active:scale-[0.98] enabled:active:opacity-80 disabled:opacity-40";

/**
 * Port of PrimaryButtonStyle.swift: the filled main button of a screen, dimmed while it can't be used. With
 * `isLoading` a spinner takes the place of the title, which stays the name of the button.
 */
export function PrimaryButton({
  isLoading = false,
  className = "",
  children,
  ...props
}: ComponentProps<"button"> & { isLoading?: boolean }) {
  return (
    <button type="button" aria-busy={isLoading || undefined} {...props} className={`${primaryButtonClass} ${className}`}>
      {isLoading ? (
        <>
          <span className="sr-only">{children}</span>
          <Spinner className="text-app-foreground" />
        </>
      ) : (
        children
      )}
    </button>
  );
}

/** The second button below a PrimaryButton, e.g. "Log in" on the welcome screen */
export function SecondaryButton({ className = "", ...props }: ComponentProps<"button">) {
  return (
    <button
      type="button"
      {...props}
      className={`flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-cell px-4 text-headline font-semibold text-app transition-[opacity,scale] duration-150 ease-out enabled:hover:opacity-90 enabled:active:scale-[0.98] enabled:active:opacity-80 disabled:opacity-40 ${className}`}
    />
  );
}

/**
 * `.bottomActionBar` of PrimaryButtonStyle.swift: the main buttons of a screen, fixed at its bottom above the content
 * (and above the tab bar on phones). `inSheet`: the last part of a sheet whose content scrolls above it.
 */
export function BottomActionBar({
  children,
  inSheet = false,
  inPane = false,
}: {
  children: ReactNode;
  inSheet?: boolean;
  /** At the bottom of a pane that ends above the tab bar, e.g. a page of the workout in progress */
  inPane?: boolean;
}) {
  return (
    <div
      className={`z-10 mt-auto shrink-0 border-t border-separator/60 bg-bar px-4 pt-2 backdrop-blur-xl ${
        // in a sheet: below its scrolling content, above the home indicator
        inSheet
          ? "pb-[calc(8px+env(safe-area-inset-bottom))]"
          : inPane
            ? "pb-2"
            : "sticky bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] pb-2 md:bottom-0"
      }`}
    >
      <div className="flex gap-3">{children}</div>
    </div>
  );
}
