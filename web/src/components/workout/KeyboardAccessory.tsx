"use client";

// The web counterpart of `ToolbarItemGroup(placement: .keyboard)`: a bar right above the on-screen keyboard. Chrome on
// Android only shrinks the visual viewport when the keyboard opens, so the bar follows the visual viewport. Its buttons
// don't take the focus, so the keyboard stays open.

import { useSyncExternalStore, type ComponentProps, type ReactNode } from "react";

import { Portal } from "@/components/ui/overlay";

function subscribe(listener: () => void) {
  const viewport = window.visualViewport;
  viewport?.addEventListener("resize", listener);
  viewport?.addEventListener("scroll", listener);
  window.addEventListener("resize", listener);
  return () => {
    viewport?.removeEventListener("resize", listener);
    viewport?.removeEventListener("scroll", listener);
    window.removeEventListener("resize", listener);
  };
}

/** How far the bottom of the visible area is above the bottom of the layout viewport (the height of the keyboard) */
function keyboardInset(): number {
  const viewport = window.visualViewport;
  if (!viewport) return 0;
  return Math.max(0, Math.round(window.innerHeight - viewport.offsetTop - viewport.height));
}

export function KeyboardAccessory({ children }: { children: ReactNode }) {
  const inset = useSyncExternalStore(subscribe, keyboardInset, () => 0);
  return (
    <Portal>
      <div
        className="fixed inset-x-0 z-[140] flex min-h-11 items-center gap-2 border-t border-separator bg-bar px-3 py-1 backdrop-blur-xl"
        style={{ bottom: inset }}
        // keeps the focus (and the keyboard) in the field
        onMouseDown={(event) => event.preventDefault()}
      >
        {children}
      </div>
    </Portal>
  );
}

/** A text button of the accessory bar, 44 px high */
export function AccessoryButton({ className = "", ...props }: ComponentProps<"button">) {
  return (
    <button
      type="button"
      {...props}
      onMouseDown={(event) => event.preventDefault()}
      className={`min-h-11 min-w-11 px-2 text-body text-app active:opacity-50 ${className}`}
    />
  );
}
