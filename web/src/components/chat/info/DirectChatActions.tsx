"use client";

import type { MenuItem } from "@/components/chat/chat-controls";
import { Spinner } from "@/components/ui/controls";

/**
 * directActions of ChatInfoView.swift: the friend actions for the other member of a direct chat as tiles with the icon
 * above the title, below the header
 */
export function DirectChatActions({ actions, isBusy }: { actions: MenuItem[]; isBusy: boolean }) {
  return (
    <div className="relative">
      <div className={`flex gap-2.5 ${isBusy ? "pointer-events-none opacity-50" : ""}`} aria-busy={isBusy || undefined}>
        {actions.map(({ label, icon: Icon, destructive, onSelect }) => (
          <button
            key={label}
            type="button"
            onClick={onSelect}
            className={`flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-[14px] bg-cell px-1 py-3 transition-[scale,opacity] hover:opacity-90 active:scale-[0.97] active:opacity-70 ${
              destructive ? "text-[#ff3b30] dark:text-[#ff453a]" : "text-app"
            }`}
          >
            {Icon && <Icon size={22} className="h-6" aria-hidden />}
            {/* "Report…" opens a dialog, the tile says "Report" like on iOS */}
            <span className="w-full truncate text-caption1 font-medium">{label.replace(/…$/u, "")}</span>
          </button>
        ))}
      </div>
      {isBusy && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner />
        </span>
      )}
    </div>
  );
}
