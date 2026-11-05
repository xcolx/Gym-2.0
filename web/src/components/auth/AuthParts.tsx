"use client";

// The shared parts of the screens of AuthView.swift

import { ChevronLeft, Circle, CircleAlert, CircleCheck, Eye, EyeOff, type LucideIcon } from "lucide-react";
import { useState, type ComponentProps, type FormEvent, type ReactNode } from "react";

/** The app icon on the welcome screen, in the shape of the home screen icons */
export function AppMark({ size }: { size: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/icon.png"
      alt=""
      width={size}
      height={size}
      // the black icon would disappear on the dark background without its edge
      className="dark:outline dark:outline-1 dark:-outline-offset-1 dark:outline-white/20"
      style={{ borderRadius: size * 0.225, boxShadow: `0 ${size * 0.08}px ${size * 0.3}px rgba(0, 0, 0, 0.25)` }}
    />
  );
}

/** The bar above a screen of the login flow, with the button back to the welcome screen */
export function AuthBackBar({ onBack }: { onBack: () => void }) {
  return (
    <div className="mx-auto flex h-11 w-full max-w-[500px] shrink-0 items-center px-2">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className="flex size-11 items-center justify-center rounded-full text-app hover:bg-field/25 active:opacity-50"
      >
        <ChevronLeft size={30} strokeWidth={2.25} aria-hidden />
      </button>
    </div>
  );
}

/**
 * A screen of the login flow (AuthPage): a large heading, the content and a bottom part with the main button, which
 * stays at the bottom of the screen. The whole screen is the form, so Enter in a field sends it.
 */
export function AuthPage({
  icon: Icon,
  title,
  subtitle,
  onBack,
  onSubmit,
  bottom,
  children,
}: {
  icon?: LucideIcon;
  title: string;
  subtitle: string;
  onBack: () => void;
  onSubmit: (event: FormEvent) => void;
  bottom: ReactNode;
  children: ReactNode;
}) {
  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="flex min-h-dvh flex-col bg-grouped pt-[env(safe-area-inset-top)] [--placeholder:rgba(60,60,67,0.3)] dark:[--placeholder:rgba(235,235,245,0.3)]"
    >
      <AuthBackBar onBack={onBack} />
      <div className="mx-auto flex w-full max-w-[500px] flex-1 flex-col gap-3 px-6 pt-2">
        {Icon && (
          <span className="mb-1 flex size-[60px] items-center justify-center rounded-full bg-app/12 text-app" aria-hidden>
            <Icon size={28} />
          </span>
        )}
        <h1 className="text-large-title font-bold">{title}</h1>
        <p className="mb-4 text-secondary-label">{subtitle}</p>
        {children}
      </div>
      <div className="sticky bottom-0 bg-grouped pb-[calc(8px+env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto flex w-full max-w-[500px] flex-col items-center gap-3.5 px-6">{bottom}</div>
      </div>
    </form>
  );
}

/** A rounded text field with an icon (AuthTextField). Password fields have a button to show the password. */
export function AuthTextField({
  icon: Icon,
  type = "text",
  ...props
}: Omit<ComponentProps<"input">, "className"> & { icon: LucideIcon }) {
  const [showsPassword, setShowsPassword] = useState(false);
  const isPassword = type === "password";
  return (
    <div className="focus-ring-within flex min-h-[52px] items-center gap-3 rounded-[14px] border-[0.5px] border-separator/50 bg-cell px-4">
      <Icon size={20} className="w-[22px] shrink-0 text-secondary-label" aria-hidden />
      <input
        {...props}
        type={isPassword && showsPassword ? "text" : type}
        aria-label={props.placeholder}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className="h-[52px] min-w-0 flex-1 bg-transparent outline-none placeholder:text-[var(--placeholder)]"
      />
      {isPassword && (
        <button
          type="button"
          onClick={() => setShowsPassword(!showsPassword)}
          aria-label={showsPassword ? "Hide password" : "Show password"}
          className="-mr-2 flex size-9 shrink-0 items-center justify-center rounded-full text-secondary-label hover:bg-field/25"
        >
          {showsPassword ? <EyeOff size={20} aria-hidden /> : <Eye size={20} aria-hidden />}
        </button>
      )}
    </div>
  );
}

/** A rule of the new password, ticked off once it's met */
export function PasswordRule({ title, isMet }: { title: string; isMet: boolean }) {
  return (
    <li
      className={`flex items-center gap-1.5 text-footnote transition-colors ${
        isMet ? "text-[#34c759] dark:text-[#30d158]" : "text-secondary-label"
      }`}
    >
      {isMet ? (
        <CircleCheck size={16} className="fill-current stroke-[var(--grouped-bg)]" aria-hidden />
      ) : (
        <Circle size={16} aria-hidden />
      )}
      {title}
      <span className="sr-only">{isMet ? ", met" : ", not met"}</span>
    </li>
  );
}

/** A checkbox with a label, whose links open on their own (AuthCheckbox) */
export function AuthCheckbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-subheadline">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-px size-5 shrink-0 cursor-pointer accent-[var(--app-color)]"
      />
      <span>{children}</span>
    </label>
  );
}

/** An error or success below the fields (AuthMessage) */
export function AuthMessage({ text, style }: { text: string; style: "error" | "success" }) {
  const Icon = style === "error" ? CircleAlert : CircleCheck;
  return (
    <p
      role={style === "error" ? "alert" : "status"}
      className={`flex items-start gap-2 whitespace-pre-line rounded-xl p-3 text-subheadline ${
        style === "error"
          ? "bg-[#ff3b30]/10 text-[#ff3b30] dark:text-[#ff453a]"
          : "bg-[#34c759]/10 text-[#248a3d] dark:text-[#30d158]"
      }`}
    >
      <Icon size={18} className="mt-px shrink-0 fill-current stroke-[var(--grouped-bg)]" aria-hidden />
      {text}
    </p>
  );
}

/** The link between logging in and creating an account (AuthSwitchLink) */
export function AuthSwitchLink({ question, action, onClick }: { question: string; action: string; onClick: () => void }) {
  return (
    <p className="flex gap-1 text-subheadline">
      <span className="text-secondary-label">{question}</span>
      <button type="button" onClick={onClick} className="font-semibold text-app hover:underline active:opacity-50">
        {action}
      </button>
    </p>
  );
}
