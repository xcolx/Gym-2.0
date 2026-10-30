// No "use client": app/not-found.tsx is a server component and passes the icon component, which can't be sent to a
// client component.

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * A full screen `ContentUnavailableView`: icon, title, description and the buttons below. Used by the 404 and error
 * pages (app/not-found.tsx, app/error.tsx, app/global-error.tsx).
 */
export function StatusScreen({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 py-10 text-center">
      <Icon size={48} strokeWidth={1.5} className="mb-2 text-secondary-label" aria-hidden />
      <h1 className="text-title2 font-bold">{title}</h1>
      <div className="max-w-md text-[15px] leading-5 text-secondary-label">{description}</div>
      {children && <div className="mt-4 flex flex-col items-center gap-3">{children}</div>}
    </div>
  );
}

/** The tinted button of the status screens (`.borderedProminent`) */
export const STATUS_PRIMARY_BUTTON =
  "min-h-11 rounded-[12px] bg-app px-5 py-2.5 text-headline font-semibold text-white active:opacity-60";
/** The plain button of the status screens */
export const STATUS_SECONDARY_BUTTON = "min-h-11 px-5 py-2.5 text-body text-app active:opacity-50";
