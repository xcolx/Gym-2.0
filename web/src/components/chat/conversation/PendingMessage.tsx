"use client";

import { CircleAlert } from "lucide-react";

import { Spinner } from "@/components/ui/controls";

/** The text that couldn't be sent yet, e.g. offline. It's sent again by every sync until the server accepts it. */
export function PendingMessage({ text, isSending, onRetry }: { text: string; isSending: boolean; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-end gap-1 pl-[60px] pt-2.5">
      <p className="whitespace-pre-wrap break-words rounded-[18px] bg-app/45 px-3 py-2 text-app-foreground [overflow-wrap:anywhere]">
        {text}
      </p>
      <div className="flex items-center gap-1.5 px-1.5 text-caption1 text-secondary-label">
        {isSending ? (
          <>
            <Spinner size={12} />
            Sending…
          </>
        ) : (
          <>
            <CircleAlert size={14} className="shrink-0 fill-[#ff3b30] text-background" aria-hidden />
            Not sent, it&apos;s sent when you&apos;re online
            <button type="button" className="font-semibold text-app active:opacity-50" onClick={onRetry}>
              Retry
            </button>
          </>
        )}
      </div>
    </div>
  );
}
