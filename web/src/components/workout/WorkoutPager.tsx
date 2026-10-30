"use client";

// The `TabView` with `PageTabViewStyle` of WhilstWorkoutView.swift. The shown page is kept in the session storage, so
// a reload or a visit of another tab comes back to it.

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

const MAX_DOTS = 20;

export function WorkoutPager({ pages, storageKey }: { pages: { key: string; label: string; content: ReactNode }[]; storageKey: string }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const shownPage = Math.min(page, pages.length - 1);

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
    try {
      window.sessionStorage.setItem(storageKey, String(current));
    } catch {
      // only kept while the page is open
    }
  };

  const show = (index: number) => {
    const element = scroller.current;
    element?.scrollTo({ left: index * element.clientWidth, behavior: "smooth" });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={scroller}
        onScroll={onScroll}
        className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {pages.map((p, index) => (
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
      <div className="flex h-7 shrink-0 items-center justify-center gap-0.5" role="tablist" aria-label="Pages">
        {pages.length > MAX_DOTS ? (
          <span className="text-footnote text-secondary-label">
            {shownPage + 1} / {pages.length}
          </span>
        ) : (
          pages.map((p, index) => (
            <button
              key={p.key}
              type="button"
              role="tab"
              aria-selected={index === shownPage}
              aria-label={p.label}
              onClick={() => show(index)}
              className="flex h-7 w-4 items-center justify-center"
            >
              <span className={`h-[7px] w-[7px] rounded-full ${index === shownPage ? "bg-my-black" : "bg-my-black/25"}`} />
            </button>
          ))
        )}
      </div>
    </div>
  );
}
