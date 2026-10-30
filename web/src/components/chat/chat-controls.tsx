"use client";

// The SwiftUI controls only the chat screens use, the shared ones are in components/ui

import type { LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

// MARK: - Colors (UIKit's grouped background colors)

/** `secondarySystemBackground`, e.g. the bubbles of the messages of others */
export const SECONDARY_BACKGROUND = "bg-[#f2f2f7] dark:bg-[#1c1c1e]";
export const DESTRUCTIVE_TEXT = "text-[#ff3b30] dark:text-[#ff453a]";

// MARK: - Buttons

/** `.buttonStyle(.bordered)` */
export const BORDERED_BUTTON =
  "inline-flex items-center justify-center rounded-full bg-field/40 px-3 py-1 text-[15px] font-medium text-app active:opacity-60 disabled:opacity-40";
/** `.buttonStyle(.borderedProminent)` */
export const PROMINENT_BUTTON =
  "inline-flex items-center justify-center rounded-full bg-app px-3 py-1 text-[15px] font-semibold text-white active:opacity-60 disabled:opacity-40";
/** A plain button in the app color, like the toolbar buttons */
export const PLAIN_BUTTON = "text-app active:opacity-50 disabled:text-tab-inactive disabled:active:opacity-100";

/** `ContentUnavailableView`: an icon, a title, a description and actions in the middle of the screen */
export function ContentUnavailable({
  icon: Icon,
  title,
  description,
  children,
  className = "",
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 px-8 py-10 text-center ${className}`}>
      {Icon && <Icon size={44} strokeWidth={1.5} className="mb-2 text-secondary-label" aria-hidden />}
      <h2 className="text-title2 font-bold">{title}</h2>
      {description && <p className="text-[15px] leading-5 text-secondary-label">{description}</p>}
      {children && <div className="mt-2 flex flex-col items-center gap-3">{children}</div>}
    </div>
  );
}

// MARK: - Menu

export interface MenuItem {
  label: string;
  icon?: LucideIcon;
  destructive?: boolean;
  onSelect: () => void;
}

/**
 * `Menu`: a button that opens a popover with the items, below the button (above it near the bottom of the screen).
 * Rendered into the body, so a list with rounded corners doesn't cut it off.
 */
export function Menu({
  items,
  label,
  children,
  className = "",
}: {
  items: MenuItem[];
  /** The accessibility label of the button */
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const open = position !== null;

  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !button.current?.contains(target)) setPosition(null);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setPosition(null);
    const dismiss = () => setPosition(null);
    document.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, [open]);

  const toggle = () => {
    if (open || !button.current) {
      setPosition(null);
      return;
    }
    const rect = button.current.getBoundingClientRect();
    const right = Math.max(8, window.innerWidth - rect.right);
    setPosition(
      rect.bottom > window.innerHeight * 0.6
        ? { right, bottom: window.innerHeight - rect.top + 8 }
        : { right, top: rect.bottom + 8 },
    );
  };

  return (
    <div className={className}>
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center text-app active:opacity-50"
        onClick={toggle}
      >
        {children}
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            style={position}
            className="fixed z-[160] min-w-[220px] max-w-[calc(100vw-16px)] overflow-hidden rounded-[14px] bg-[rgba(250,250,250,0.97)] shadow-[0_8px_40px_rgba(0,0,0,0.2)] backdrop-blur-xl dark:bg-[rgba(44,44,46,0.97)]"
          >
            {items.map(({ label: itemLabel, icon: Icon, destructive, onSelect }, index) => (
              <button
                key={itemLabel}
                type="button"
                role="menuitem"
                className={`flex w-full items-center justify-between gap-4 px-4 py-3 text-left text-body active:bg-field/40 ${
                  index > 0 ? "border-t border-separator" : ""
                } ${destructive ? DESTRUCTIVE_TEXT : "text-foreground"}`}
                onClick={() => {
                  setPosition(null);
                  onSelect();
                }}
              >
                {itemLabel}
                {Icon && <Icon size={19} aria-hidden />}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
