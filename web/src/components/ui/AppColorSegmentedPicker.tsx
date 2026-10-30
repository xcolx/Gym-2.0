"use client";

/**
 * Port of AppColorSegmentedPicker.swift: a segmented picker with the selected segment in the app color and the text
 * on it black or white, whichever reads better (`appColorForeground`, passed as `selectedForeground`).
 */
export function AppColorSegmentedPicker<Option extends string>({
  options,
  selection,
  onChange,
  title = (option) => option,
  selectedForeground,
  label,
  className = "",
}: {
  options: readonly Option[];
  selection: Option;
  onChange: (option: Option) => void;
  title?: (option: Option) => string;
  selectedForeground: string;
  /** For screen readers */
  label: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`flex rounded-[9px] bg-[var(--segment-bg)] p-0.5 [--segment-bg:rgba(118,118,128,0.12)] dark:[--segment-bg:rgba(118,118,128,0.24)] ${className}`}
    >
      {options.map((option) => {
        const selected = option === selection;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option)}
            className={`min-w-0 flex-1 truncate rounded-[7px] py-1.5 text-[15px] font-medium leading-5 transition-colors duration-200 ${
              selected ? "bg-app" : "text-foreground"
            }`}
            style={selected ? { color: selectedForeground } : undefined}
          >
            {title(option)}
          </button>
        );
      })}
    </div>
  );
}
