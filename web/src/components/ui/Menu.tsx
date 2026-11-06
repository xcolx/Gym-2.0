"use client";

import { Check, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

const DESTRUCTIVE_TEXT = "text-[#ff3b30] dark:text-[#ff453a]";

export interface MenuItem {
  label: string;
  icon?: LucideIcon;
  destructive?: boolean;
  disabled?: boolean;
  /** The selected option of a picker in the menu, with a check mark */
  checked?: boolean;
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
            {items.map(({ label: itemLabel, icon: Icon, destructive, disabled, checked, onSelect }, index) => (
              <button
                key={itemLabel}
                type="button"
                role={checked === undefined ? "menuitem" : "menuitemradio"}
                aria-checked={checked}
                disabled={disabled}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left text-body enabled:hover:bg-field/20 enabled:active:bg-field/40 disabled:opacity-40 ${
                  index > 0 ? "border-t border-separator" : ""
                } ${destructive ? DESTRUCTIVE_TEXT : "text-foreground"}`}
                onClick={() => {
                  setPosition(null);
                  onSelect();
                }}
              >
                {checked !== undefined && (
                  <Check size={17} strokeWidth={2.5} className={`-ml-1 shrink-0 ${checked ? "" : "invisible"}`} aria-hidden />
                )}
                <span className="flex-1">{itemLabel}</span>
                {Icon && <Icon size={19} aria-hidden />}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
