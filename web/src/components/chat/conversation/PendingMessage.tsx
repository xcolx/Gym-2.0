"use client";

/** The text that couldn't be sent yet, e.g. offline. It's sent again by every sync until the server accepts it. */
export function PendingMessage({ text, isSending, onRetry }: { text: string; isSending: boolean; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-end gap-1 pl-[60px]">
      <p className="whitespace-pre-wrap break-words rounded-2xl bg-app/50 px-3 py-2 text-white [overflow-wrap:anywhere]">{text}</p>
      <div className="flex items-center gap-3 text-[12px]">
        <span className="text-secondary-label">{isSending ? "Sending..." : "Not sent yet, it's sent when you're online"}</span>
        {!isSending && (
          <button type="button" className="text-app active:opacity-50" onClick={onRetry}>
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
