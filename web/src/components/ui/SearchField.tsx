import { Search } from "lucide-react";
import type { ComponentProps } from "react";

/** `.searchable`: the rounded search field below the title of a list */
export function SearchField({
  value,
  onChange,
  label,
  placeholder = "Search",
  className = "",
  ...props
}: Omit<ComponentProps<"input">, "onChange" | "value"> & {
  value: string;
  onChange: (value: string) => void;
  /** The accessible name, e.g. "Search exercises" */
  label: string;
}) {
  return (
    <label className={`focus-ring-within flex items-center gap-1.5 rounded-xl bg-field/40 px-2.5 py-2 ${className}`}>
      <Search size={18} className="shrink-0 text-secondary-label" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        enterKeyHint="search"
        autoCorrect="off"
        autoComplete="off"
        {...props}
        className="w-full bg-transparent text-body outline-none placeholder:text-secondary-label"
      />
    </label>
  );
}
