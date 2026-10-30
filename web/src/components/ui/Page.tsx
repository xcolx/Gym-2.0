"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { goBack } from "@/lib/navigation";

/** Centered content column: full width on phones, capped on laptops. */
export function Page({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <main className={`screen mx-auto flex w-full max-w-3xl flex-col md:px-6 ${className}`}>{children}</main>;
}

/**
 * NavigationStack bar + `.navigationTitle`, large or inline. The back link pops the screen when the parent is the
 * previous history entry and opens the parent in its place otherwise (`goBack`). `leading` and `trailing` are the
 * toolbar items. With an inline title a long back label (e.g. the name of a chat) is shortened, so it never covers it.
 */
export function PageHeader({
  title,
  back,
  leading,
  trailing,
  inline = false,
}: {
  title: string;
  back?: { href: string; label: string };
  leading?: ReactNode;
  trailing?: ReactNode;
  /** `.navigationBarTitleDisplayMode(.inline)` */
  inline?: boolean;
}) {
  const router = useRouter();
  return (
    <header className="shrink-0 pt-[env(safe-area-inset-top)] md:pt-4">
      <div className="relative flex h-11 items-center justify-between gap-2 px-2">
        <div className="z-10 flex min-w-0 items-center gap-4 text-app">
          {back && (
            <Link
              href={back.href}
              className="flex min-w-0 items-center text-body text-app active:opacity-50"
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
                event.preventDefault();
                goBack(router, back.href);
              }}
            >
              <ChevronLeft size={30} strokeWidth={2.25} className="-mr-0.5 shrink-0" aria-hidden />
              <span className={`truncate ${inline ? "max-w-[90px]" : ""}`}>{back.label}</span>
            </Link>
          )}
          {leading && <div className={`flex items-center gap-4 ${back ? "" : "pl-1"}`}>{leading}</div>}
        </div>
        {inline && (
          <h1 className="pointer-events-none absolute inset-x-[110px] truncate text-center text-headline font-semibold">
            {title}
          </h1>
        )}
        <div className="z-10 flex items-center gap-4 pr-2 text-app">{trailing}</div>
      </div>
      {!inline && <h1 className="px-4 pb-2 pt-0.5 text-large-title font-bold tracking-tight">{title}</h1>}
    </header>
  );
}

const pillClass =
  "inline-block w-fit rounded-[25px] bg-my-black p-[15px] text-title text-my-white transition-opacity active:opacity-60 hover:opacity-85";

/** The black rounded "NavigationLink" buttons used all over the app. */
export function PillLink({ className = "", ...props }: ComponentProps<typeof Link>) {
  return <Link {...props} className={`${pillClass} ${className}`} />;
}

export function PillButton({ className = "", ...props }: ComponentProps<"button">) {
  return <button type="button" {...props} className={`${pillClass} disabled:opacity-40 ${className}`} />;
}
