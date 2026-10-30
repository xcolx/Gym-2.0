"use client";

import { useState, type ReactNode } from "react";

import { afterOverlayClose, modalRef, Portal, useEscape } from "./overlay";

interface AlertButton {
  label: string;
  /** "cancel" is bold (unless another button `isDefault`) and also chosen by Escape, "destructive" is red */
  role?: "cancel" | "destructive";
  /** Bold like `.keyboardShortcut(.defaultAction)` */
  isDefault?: boolean;
  disabled?: boolean;
  /** Called once the alert closed */
  onSelect?: () => void;
}

/**
 * A SwiftUI `.alert`: title, message, optional content (e.g. a text field) and buttons, side by side if there are two
 * with the cancel button on the left, stacked otherwise with the cancel button at the bottom. Every button closes the
 * alert. Like on iOS it isn't closed by tapping outside.
 */
export function Alert({
  open,
  title,
  message,
  buttons,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  message?: ReactNode;
  buttons: AlertButton[];
  onClose: () => void;
  children?: ReactNode;
}) {
  const cancel = buttons.find((button) => button.role === "cancel");
  useEscape(open, () => {
    onClose();
    if (cancel?.onSelect) afterOverlayClose(cancel.onSelect);
  });
  if (!open) return null;

  const sideBySide = buttons.length === 2;
  const others = buttons.filter((button) => button !== cancel);
  const ordered = cancel ? (sideBySide ? [cancel, ...others] : [...others, cancel]) : buttons;
  const hasDefault = buttons.some((button) => button.isDefault);

  return (
    <Portal>
      <div
        ref={modalRef}
        className="fixed inset-0 z-[140] flex items-center justify-center bg-black/35 p-6 [--alert-bg:rgba(242,242,242,0.97)] dark:[--alert-bg:rgba(44,44,46,0.97)]"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="max-h-[85dvh] w-[270px] max-w-full overflow-y-auto overscroll-contain rounded-[14px] bg-[var(--alert-bg)] text-center text-foreground shadow-xl backdrop-blur-xl">
          <div className="px-4 pb-4 pt-5">
            <h2 className="text-headline font-semibold">{title}</h2>
            {message && <div className="mt-0.5 whitespace-pre-line text-footnote">{message}</div>}
            {children && <div className="mt-3">{children}</div>}
          </div>
          <div className={`border-t border-separator ${sideBySide ? "grid grid-cols-2" : "flex flex-col"}`}>
            {ordered.map((button, index) => (
              <button
                key={`${button.label}-${index}`}
                type="button"
                disabled={button.disabled}
                className={`min-h-11 px-2 py-[11px] text-body active:bg-field/50 disabled:opacity-40 ${
                  index > 0 ? (sideBySide ? "border-l border-separator" : "border-t border-separator") : ""
                } ${button.role === "destructive" ? "text-[#ff3b30] dark:text-[#ff453a]" : "text-app"} ${
                  button.isDefault || (button.role === "cancel" && !hasDefault) ? "font-semibold" : ""
                }`}
                onClick={() => {
                  onClose();
                  const { onSelect } = button;
                  if (onSelect) afterOverlayClose(onSelect);
                }}
              >
                {button.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Portal>
  );
}

/** `.alert(title, isPresented:) { Button("OK", role: .cancel) } message: { Text(message) }`, shown while `message` isn't null */
export function MessageAlert({ title, message, onClose }: { title: string; message: string | null; onClose: () => void }) {
  return (
    <Alert open={message !== null} title={title} message={message ?? ""} onClose={onClose} buttons={[{ label: "OK", role: "cancel" }]} />
  );
}

/**
 * An alert with a text field, like the report and rename alerts of the iOS app: "Cancel" and the confirmation, which
 * is disabled while `canConfirm` returns false for the text. Starts with `initialValue` every time it opens.
 */
export function PromptAlert({
  open,
  ...props
}: {
  open: boolean;
  title: string;
  message?: string;
  placeholder: string;
  initialValue?: string;
  confirmLabel: string;
  destructive?: boolean;
  maxLength?: number;
  canConfirm?: (text: string) => boolean;
  /** Called with the text once the alert closed */
  onConfirm: (text: string) => void;
  onClose: () => void;
}) {
  // Mounted while open, so the text field starts with the initial value every time
  return open ? <PromptAlertContent {...props} /> : null;
}

function PromptAlertContent({
  title,
  message,
  placeholder,
  initialValue = "",
  confirmLabel,
  destructive = false,
  maxLength,
  canConfirm = () => true,
  onConfirm,
  onClose,
}: Omit<Parameters<typeof PromptAlert>[0], "open">) {
  const [text, setText] = useState(initialValue);
  const enabled = canConfirm(text);
  return (
    <Alert
      open
      title={title}
      message={message}
      onClose={onClose}
      buttons={[
        { label: "Cancel", role: "cancel" },
        {
          label: confirmLabel,
          role: destructive ? "destructive" : undefined,
          isDefault: true,
          disabled: !enabled,
          onSelect: () => onConfirm(text),
        },
      ]}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!enabled) return;
          onClose();
          afterOverlayClose(() => onConfirm(text));
        }}
      >
        <input
          autoFocus
          value={text}
          maxLength={maxLength}
          onChange={(event) => setText(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="w-full rounded-[7px] border border-separator bg-background px-2 py-1.5 text-[15px] outline-none focus:border-app"
        />
      </form>
    </Alert>
  );
}
