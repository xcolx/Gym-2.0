import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

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
