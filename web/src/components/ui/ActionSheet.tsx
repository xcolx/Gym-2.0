"use client";

import { afterOverlayClose, modalRef, Portal, useBackToClose, useEscape } from "./overlay";

export interface ActionSheetButton {
  label: string;
  onSelect: () => void;
  destructive?: boolean;
}

/**
 * A SwiftUI `.actionSheet` / `.confirmationDialog`: slides up on phones, centered on larger screens. The buttons scroll,
 * e.g. the muscles of CreateExerciseView or the schemes to edit. Every button closes it, like on iOS, and so do
 * "Cancel", a tap outside, Escape and the back button of Android.
 */
export function ActionSheet({
  open,
  title,
  message,
  buttons,
  onClose,
}: {
  open: boolean;
  title: string;
  message?: string;
  buttons: ActionSheetButton[];
  onClose: () => void;
}) {
  useBackToClose(open, onClose);
  useEscape(open, onClose);
  if (!open) return null;

  const group = "overflow-hidden rounded-[14px] bg-[var(--sheet-bg)]";
  const row = "block min-h-[56px] w-full border-t border-separator px-4 py-3 text-center text-[20px] leading-6 active:bg-field/50";

  return (
    <Portal>
      <div
        ref={modalRef}
        className="fixed inset-0 z-[130] flex items-end justify-center bg-black/35 p-2 pb-[calc(8px+env(safe-area-inset-bottom))] pt-[calc(16px+env(safe-area-inset-top))] md:items-center [--sheet-bg:rgba(242,242,242,0.97)] dark:[--sheet-bg:rgba(40,40,40,0.97)]"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex max-h-full w-full max-w-md flex-col gap-2" onClick={(event) => event.stopPropagation()}>
          <div className={`${group} flex min-h-0 flex-col`}>
            <div className="shrink-0 px-4 py-3.5 text-center">
              <p className="text-footnote font-semibold text-secondary-label">{title}</p>
              {message && <p className="mt-1 text-footnote text-secondary-label">{message}</p>}
            </div>
            <div className="min-h-0 overflow-y-auto overscroll-contain">
              {buttons.map((button, index) => (
                <button
                  key={`${button.label}-${index}`}
                  type="button"
                  className={`${row} ${button.destructive ? "text-[#ff3b30]" : "text-app"}`}
                  onClick={() => {
                    onClose();
                    afterOverlayClose(button.onSelect);
                  }}
                >
                  {button.label}
                </button>
              ))}
            </div>
          </div>
          <div className={`${group} shrink-0`}>
            <button type="button" className={`${row} border-t-0 font-semibold text-app`} onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
