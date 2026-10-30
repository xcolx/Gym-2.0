"use client";

import { useEffect, useState, type ReactNode } from "react";

interface ViewportBox {
  top: number;
  height: number;
  /** Whether the on-screen keyboard covers the bottom of the page (and with it the tab bar) */
  keyboard: boolean;
}

/**
 * The visible part of the page. Chrome on Android only shrinks the visual viewport when the keyboard opens (the layout
 * viewport and `dvh` stay), so a screen with an input at the bottom has to follow `visualViewport` to stay above it.
 */
function useVisualViewport(): ViewportBox | null {
  const [box, setBox] = useState<ViewportBox | null>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      const covered = window.innerHeight - viewport.height * viewport.scale;
      setBox({ top: viewport.offsetTop, height: viewport.height, keyboard: covered > 80 });
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);
  return box;
}

/**
 * A screen with a scrolling message list and an input bar at the bottom (ChatView, AIChatView): fills the visible
 * area between the top and the tab bar, and above the keyboard while it's open.
 */
export function ChatScreen({ children }: { children: ReactNode }) {
  const box = useVisualViewport();
  // While the keyboard is open the tab bar is behind it, the screen goes down to the keyboard
  const style = box
    ? ({
        top: box.top,
        height: box.height,
        ...(box.keyboard ? { "--chat-bottom": "0px" } : {}),
      } as React.CSSProperties)
    : undefined;
  return (
    <div
      style={style}
      className="fixed inset-x-0 top-0 z-10 flex h-dvh flex-col bg-background pb-[var(--chat-bottom)] [--chat-bottom:calc(var(--tabbar-h)+env(safe-area-inset-bottom))] md:left-[var(--sidebar-w)] md:[--chat-bottom:0px]"
    >
      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col">{children}</div>
    </div>
  );
}

/**
 * The scrolling list of messages that sticks to the bottom (`.defaultScrollAnchor(.bottom)`): the content is laid out
 * in reverse, so the newest message stays visible when the list grows or the keyboard makes it smaller.
 */
export function BottomAnchoredScroll({
  children,
  scrollRef,
  className = "",
}: {
  children: ReactNode;
  scrollRef?: React.Ref<HTMLDivElement>;
  className?: string;
}) {
  return (
    <div ref={scrollRef} className={`flex min-h-0 flex-1 flex-col-reverse overflow-y-auto overscroll-contain ${className}`}>
      <div>{children}</div>
    </div>
  );
}

/** Scrolls a BottomAnchoredScroll to the newest message (`proxy.scrollTo(bottomID, anchor: .bottom)`) */
export function scrollToBottom(element: HTMLElement | null, smooth = true) {
  // In a column-reverse container the bottom is scrollTop 0
  element?.scrollTo({ top: 0, behavior: smooth ? "smooth" : "auto" });
}
