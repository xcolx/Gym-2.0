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
 * (and above the tab bar on phones)
 */
export function BottomActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] z-10 mt-auto border-t border-separator/60 bg-bar px-4 py-2 backdrop-blur-xl md:bottom-0">
      <div className="flex gap-3">{children}</div>
    </div>
  );
}
