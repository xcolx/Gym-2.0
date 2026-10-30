"use client";

import { Dumbbell } from "lucide-react";
import type { ReactNode } from "react";

import { Spinner } from "@/components/ui/controls";

export function AuthHeader({ title, subtitle }: { title: string; subtitle: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <Dumbbell size={48} strokeWidth={1.75} className="text-app" aria-hidden />
      <h1 className="text-title2 font-bold">{title}</h1>
      <p className="text-[15px] leading-5 text-secondary-label">{subtitle}</p>
    </div>
  );
}

export function AuthButton({ title, isLoading, disabled }: { title: string; isLoading: boolean; disabled: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      aria-label={title}
      aria-busy={isLoading}
      className="block w-full active:bg-field/40 disabled:active:bg-transparent"
    >
      <span className={`flex min-h-11 items-center justify-center font-semibold text-app ${disabled && !isLoading ? "opacity-40" : ""}`}>
        {isLoading ? <Spinner /> : title}
      </span>
    </button>
  );
}
