"use client";

// The building blocks of every sheet and alert: a portal into the body, a scroll lock of the page behind and the back
// button of Android, which closes the topmost sheet like the swipe down on iOS instead of leaving the page.

import { useEffect, useRef, useSyncExternalStore, type ComponentProps, type ReactNode } from "react";
import { createPortal } from "react-dom";

const noSubscribe = () => () => {};

/** False during the server render and the hydration, true afterwards */
function useIsClient(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
}

/** Renders the children at the end of the body */
export function Portal({ children }: { children: ReactNode }) {
  const isClient = useIsClient();
  return isClient ? createPortal(children, document.body) : null;
}

// MARK: - Modal

/** The open modal overlays (their root elements in the body), the topmost last */
const modalStack: HTMLElement[] = [];
const INERT_MARK = "data-gym2-inert";

/** Makes everything in the body except the topmost modal inert: not focusable, not clickable, hidden from screen readers */
function updateInert() {
  const top = modalStack[modalStack.length - 1] ?? null;
  for (const child of Array.from(document.body.children)) {
    // Next.js announces route changes with next-route-announcer, which stays live
    if (!(child instanceof HTMLElement) || child.tagName === "SCRIPT" || child.tagName === "NEXT-ROUTE-ANNOUNCER") continue;
    const inert = top !== null && child !== top && !child.contains(top);
    if (inert && !child.inert) {
      child.inert = true;
      child.setAttribute(INERT_MARK, "");
    } else if (!inert && child.hasAttribute(INERT_MARK)) {
      child.inert = false;
      child.removeAttribute(INERT_MARK);
    }
  }
}

/**
 * The ref of the root element of a modal overlay (rendered into the body by `Portal`): while it is mounted, the page
 * and the overlays below it are inert, and the focus moves into it (back to where it was when it closes).
 */
export function modalRef(element: HTMLElement | null): (() => void) | undefined {
  if (!element) return;
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  modalStack.push(element);
  updateInert();
  if (!element.contains(document.activeElement)) {
    if (!element.hasAttribute("tabindex")) element.tabIndex = -1;
    element.style.outline = "none";
    element.focus({ preventScroll: true });
  }
  return () => {
    const index = modalStack.lastIndexOf(element);
    if (index >= 0) modalStack.splice(index, 1);
    updateInert();
    if (previousFocus?.isConnected && !previousFocus.closest("[inert]")) previousFocus.focus({ preventScroll: true });
  };
}

let scrollLocks = 0;

/** Keeps the page behind an overlay from scrolling while `active` */
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    scrollLocks += 1;
    document.body.style.overflow = "hidden";
    return () => {
      scrollLocks -= 1;
      if (scrollLocks === 0) document.body.style.overflow = "";
    };
  }, [active]);
}

// MARK: - Back button

interface HistoryEntry {
  close: () => void;
}

/** The open overlays with an own history entry, the topmost last */
const historyStack: HistoryEntry[] = [];
/** History traversals started here to remove entries of overlays closed in the UI, their popstate is ignored */
let ownTraversals = 0;
let listening = false;
/** Waiting for the own traversals to finish, see `afterOverlayClose` */
let waiting: (() => void)[] = [];

function runWaiting() {
  const callbacks = waiting;
  waiting = [];
  callbacks.forEach((callback) => callback());
}

function onPopState() {
  if (ownTraversals > 0) {
    ownTraversals -= 1;
    if (ownTraversals === 0) runWaiting();
    return;
  }
  historyStack.pop()?.close();
}

/** Entries to remove, overlays closed together (e.g. an exercise and its detail after a delete) go back at once */
let pendingBack = 0;

function scheduleBack(entries: number) {
  pendingBack += entries;
  if (pendingBack !== entries) return;
  queueMicrotask(() => {
    const count = pendingBack;
    pendingBack = 0;
    // Only while an entry of an overlay is still the current one, e.g. not after a navigation to another page
    if (count > 0 && window.history.state?.gym2Overlay) {
      ownTraversals += 1;
      window.history.go(-count);
    }
  });
}

/**
 * Runs `action` once an overlay closed in the same event has removed its history entry. A navigation started earlier
 * would be undone by that traversal, e.g. "Edit" in a sheet that opens another page.
 */
export function afterOverlayClose(action: () => void) {
  // after React committed the close and the overlay started its traversal
  setTimeout(() => {
    if (ownTraversals === 0) {
      action();
      return;
    }
    let done = false;
    const once = () => {
      if (done) return;
      done = true;
      action();
    };
    waiting.push(once);
    // in case the browser never reports the traversal
    setTimeout(once, 600);
  }, 0);
}

/**
 * Gives an open overlay an own history entry, so that the back button (or gesture) of Android closes it. The entry has
 * no URL of its own, the Next router copies its state into it and stays on the page. Closing the overlay in the UI
 * removes the entry again (together with the entries of overlays opened on top of it).
 */
export function useBackToClose(open: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    if (!listening) {
      window.addEventListener("popstate", onPopState);
      listening = true;
    }
    let closedByBack = false;
    const entry: HistoryEntry = {
      close: () => {
        closedByBack = true;
        onCloseRef.current();
      },
    };
    window.history.pushState({ gym2Overlay: true }, "");
    historyStack.push(entry);
    return () => {
      if (closedByBack) return;
      const index = historyStack.indexOf(entry);
      if (index < 0) return;
      scheduleBack(historyStack.length - index);
      historyStack.splice(index);
    };
  }, [open]);
}

/** Calls `onEscape` when Escape is pressed while `active` (hardware keyboards, desktop) */
export function useEscape(active: boolean, onEscape: () => void) {
  const ref = useRef(onEscape);
  useEffect(() => {
    ref.current = onEscape;
  });
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") ref.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);
}

// MARK: - Sheet and full screen cover

/** A toolbar button of a sheet ("Cancel", "Done", "Save"), `bold` for the confirmation action */
export function SheetButton({ bold = false, className = "", ...props }: ComponentProps<"button"> & { bold?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={`text-body text-app active:opacity-50 disabled:text-tab-inactive disabled:active:opacity-100 ${bold ? "font-semibold" : ""} ${className}`}
    />
  );
}

/**
 * A SwiftUI `.sheet` on phones (slides up, almost the full height) and a centered dialog on larger screens.
 * Closed with the back button, Escape or the backdrop.
 *
 * With a `title`, `leading` or `trailing` it has the inline navigation bar of its NavigationStack (e.g. "Cancel", the
 * title and "Save") and the children scroll below it. Without, the children fill the sheet with their own layout
 * (e.g. a NavigationStack with several screens). `grouped`: the gray background of a Form.
 */
export function Sheet({
  open,
  onClose,
  label,
  title,
  leading,
  trailing,
  grouped = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** For screen readers, the title if not given */
  label?: string;
  title?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  grouped?: boolean;
  children: ReactNode;
}) {
  useBodyScrollLock(open);
  useBackToClose(open, onClose);
  useEscape(open, onClose);
  if (!open) return null;
  const hasBar = title !== undefined || leading !== undefined || trailing !== undefined;
  return (
    <Portal>
      <div
        ref={modalRef}
        className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 md:items-center md:p-6"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label={label ?? title}
      >
        <div
          // Like iOS, a sheet is a bit lighter than the page in the dark appearance
          className={`flex h-[calc(100dvh-env(safe-area-inset-top)-12px)] w-full flex-col overflow-hidden rounded-t-[12px] text-foreground md:h-[min(760px,90dvh)] md:max-w-xl md:rounded-[16px] dark:[--cell-bg:#2c2c2e] dark:[--grouped-bg:#1c1c1e] ${
            grouped ? "bg-grouped" : "bg-background dark:bg-[#1c1c1e]"
          }`}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mx-auto mt-1.5 h-[5px] w-9 shrink-0 rounded-full bg-field md:hidden" />
          {hasBar ? (
            <>
              <div className="relative flex h-11 shrink-0 items-center justify-between gap-2 px-4">
                <div className="z-10 flex items-center">{leading}</div>
                {title && <h2 className="absolute inset-x-24 truncate text-center text-headline font-semibold">{title}</h2>}
                <div className="z-10 flex items-center">{trailing}</div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[calc(16px+env(safe-area-inset-bottom))]">
                {children}
              </div>
            </>
          ) : (
            children
          )}
        </div>
      </div>
    </Portal>
  );
}

/** A SwiftUI `.fullScreenCover`: covers the whole screen including the tab bar. Closed with the back button too. */
export function FullScreenCover({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
}) {
  useBodyScrollLock(open);
  useBackToClose(open, onClose);
  if (!open) return null;
  return (
    <Portal>
      <div
        ref={modalRef}
        className="fixed inset-0 z-[110] flex flex-col overflow-y-auto overscroll-contain bg-background pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-foreground"
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">{children}</div>
      </div>
    </Portal>
  );
}
