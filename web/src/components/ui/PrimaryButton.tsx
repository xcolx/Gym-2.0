"use client";

import type { ComponentProps } from "react";

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
