"use client";

// The `TabView` with `PageTabViewStyle` of WhilstWorkoutView.swift. The shown page is kept in the session storage, so
// a reload or a visit of another tab comes back to it.

import { useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { Flag } from "lucide-react";

export interface WorkoutPagerHandle {
  show(index: number): void;
}

/**
 * The exercises as pages that are swiped, the last page finishes the workout. Above them one bar per exercise: the
 * shown one in the app color, the ones with sets faded, the empty ones gray, and a flag for the finish page.
 */
export function WorkoutPager({
  pages,
  finish,
  storageKey,
  onPageChange,
  ref,
}: {
  pages: { key: string; label: string; content: ReactNode; hasSets: boolean }[];
  finish: ReactNode;
  storageKey: string;
  /** The index of the shown page, the number of exercises for the finish page */
  onPageChange?: (page: number) => void;
  ref?: Ref<WorkoutPagerHandle>;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const pageCount = pages.length + 1;
  const shownPage = Math.min(page, pageCount - 1);

  // back to the page shown before
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    let saved = 0;
    try {
      saved = Number(window.sessionStorage.getItem(storageKey) ?? 0) || 0;
    } catch {
      // starts with the first page
    }
    element.scrollLeft = saved * element.clientWidth;
  }, [storageKey]);

  const onScroll = () => {
    const element = scroller.current;
    if (!element || element.clientWidth === 0) return;
    const current = Math.round(element.scrollLeft / element.clientWidth);
    if (current === page) return;
    setPage(current);
    onPageChange?.(current);
    try {
      window.sessionStorage.setItem(storageKey, String(current));
    } catch {
      // only kept while the page is open
    }
  };

  const show = (index: number, smooth = true) => {
    const element = scroller.current;
    element?.scrollTo({ left: index * element.clientWidth, behavior: smooth ? "smooth" : "instant" });
  };
  useImperativeHandle(ref, () => ({ show: (index) => show(index, false) }));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className="flex h-7 shrink-0 items-center gap-1 px-4 pb-1"
        role="tablist"
        aria-label={shownPage < pages.length ? `Exercise ${shownPage + 1} of ${pages.length}` : "Finish"}
      >
        {pages.map((p, index) => (
          <button
            key={p.key}
            type="button"
            role="tab"
            aria-selected={index === shownPage}
            aria-label={p.label}
            onClick={() => show(index)}
            className="flex h-full min-w-0 flex-1 items-center"
          >
            <span
              className={`h-1 w-full rounded-full transition-colors duration-200 ${
                index === shownPage ? "bg-app" : p.hasSets ? "bg-app/35" : "bg-field/60"
              }`}
            />
          </button>
        ))}
        <button
          type="button"
          role="tab"
          aria-selected={shownPage === pages.length}
          aria-label="Finish"
          onClick={() => show(pages.length)}
          className={`flex size-7 shrink-0 items-center justify-center ${shownPage === pages.length ? "text-app" : "text-secondary-label"}`}
        >
          <Flag size={14} strokeWidth={2.5} aria-hidden />
        </button>
      </div>

      <div
        ref={scroller}
        onScroll={onScroll}
        className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {[...pages, { key: "finish", label: "Finish", content: finish }].map((p, index) => (
          <section
            key={p.key}
            aria-label={p.label}
            aria-hidden={index !== shownPage}
            className="h-full w-full shrink-0 snap-start snap-always overflow-y-auto overscroll-y-contain"
          >
            {p.content}
          </section>
        ))}
      </div>
    </div>
  );
}
