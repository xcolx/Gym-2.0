"use client";

// SwiftUI `Form` / `List` in the inset grouped style

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { PageHeader } from "@/components/ui/Page";
import { Spinner } from "@/components/ui/controls";

/** A page with a `Form`: the grouped background behind the navigation bar and the sections */
export function FormPage({
  title,
  back,
  inline = false,
  trailing,
  withoutTabBar = false,
  children,
}: {
  title: string;
  back?: { href: string; label: string };
  inline?: boolean;
  trailing?: ReactNode;
  /** For the screens shown while signed out: the whole height */
  withoutTabBar?: boolean;
  children: ReactNode;
}) {
  return (
    <main className={`${withoutTabBar ? "min-h-dvh" : "screen"} bg-grouped [--placeholder:rgba(60,60,67,0.3)] dark:[--placeholder:rgba(235,235,245,0.3)]`}>
      <div className="mx-auto flex w-full max-w-3xl flex-col md:px-6">
        <PageHeader title={title} back={back} inline={inline} trailing={trailing} />
        <FormStack>{children}</FormStack>
      </div>
    </main>
  );
}

/** The sections of a Form below each other, e.g. in a sheet with `grouped` (FormPage uses it as well) */
export function FormStack({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-[35px] px-4 pb-10 pt-2">{children}</div>;
}

/** `Section { } header: { } footer: { }`. `plain`: without the cell background (`.listRowBackground(Color.clear)`). */
export function FormSection({
  header,
  footer,
  plain = false,
  children,
}: {
  header?: ReactNode;
  footer?: ReactNode;
  plain?: boolean;
  children: ReactNode;
}) {
  return (
    <section>
      {header && <h2 className="px-4 pb-1.5 text-footnote uppercase text-secondary-label">{header}</h2>}
      <div className={plain ? "" : "overflow-hidden rounded-[10px] bg-cell"}>{children}</div>
      {footer && <div className="px-4 pt-1.5 text-footnote text-secondary-label">{footer}</div>}
    </section>
  );
}

const rowInner = "flex min-h-11 items-center gap-3 border-t border-separator py-2.5 pr-4";
const rowOuter = "block w-full pl-4 text-left [&:first-child>*]:border-t-0";

/**
 * One row of a section, with the separator inset like on iOS. `className` styles the content, `rowClassName` and the
 * other props the whole row (e.g. `relative` for an overlay button, `onContextMenu`).
 */
export function FormRow({
  children,
  className = "",
  rowClassName = "",
  ...props
}: ComponentProps<"div"> & { rowClassName?: string }) {
  return (
    <div {...props} className={`${rowOuter} ${rowClassName}`}>
      <div className={`${rowInner} ${className}`}>{children}</div>
    </div>
  );
}

/** A row that is a button with any content, e.g. a friend to select. `className` styles the content. */
export function PressableRow({ children, className = "", ...props }: ComponentProps<"button">) {
  return (
    <button type="button" {...props} className={`${rowOuter} active:bg-field/40 disabled:active:bg-transparent`}>
      <div className={`${rowInner} ${props.disabled ? "opacity-40" : ""} ${className}`}>{children}</div>
    </button>
  );
}

/** `LabeledContent(label, value:)`: the value on the right in the secondary color */
export function LabeledRow({ label, value }: { label: ReactNode; value?: ReactNode }) {
  return (
    <FormRow>
      <span className="flex-1">{label}</span>
      {value !== undefined && <span className="min-w-0 truncate text-secondary-label">{value}</span>}
    </FormRow>
  );
}

/** `NavigationLink` in a form: label, optional value and a chevron */
export function LinkRow({ href, label, value, className = "" }: { href: string; label: ReactNode; value?: ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      // The name of the row for screen readers, like the label and value VoiceOver reads
      aria-label={typeof label === "string" ? (typeof value === "string" && value !== "" ? `${label}, ${value}` : label) : undefined}
      className={`${rowOuter} active:bg-field/40`}
    >
      <div className={`${rowInner} ${className}`}>
        <span className="flex-1">{label}</span>
        {value !== undefined && <span className="min-w-0 truncate text-secondary-label">{value}</span>}
        <ChevronRight size={18} strokeWidth={2.5} className="-mr-1 shrink-0 text-tab-inactive/70" aria-hidden />
      </div>
    </Link>
  );
}

/** A `Button` in a form: tinted (or red), with a spinner on the right while `isLoading`. An icon can come first. */
export function ButtonRow({
  children,
  destructive = false,
  isLoading = false,
  centered = false,
  bold = false,
  ...props
}: ComponentProps<"button"> & { destructive?: boolean; isLoading?: boolean; centered?: boolean; bold?: boolean }) {
  return (
    <PressableRow
      {...props}
      className={`${centered ? "justify-center" : ""} ${bold ? "font-semibold" : ""} ${
        destructive ? "text-[#ff3b30] dark:text-[#ff453a]" : "text-app"
      }`}
    >
      {centered && isLoading ? (
        <Spinner />
      ) : (
        <>
          <span className={`flex items-center gap-3 ${centered ? "" : "flex-1"}`}>{children}</span>
          {isLoading && <Spinner />}
        </>
      )}
    </PressableRow>
  );
}

/** `TextField` / `SecureField` in a form row */
export function InputRow({ className = "", ...props }: ComponentProps<"input">) {
  return (
    <FormRow className="py-0" rowClassName="focus-ring-within rounded-[10px]">
      <input
        {...props}
        className={`h-11 w-full min-w-0 bg-transparent outline-none placeholder:text-[var(--placeholder)] ${className}`}
      />
    </FormRow>
  );
}
