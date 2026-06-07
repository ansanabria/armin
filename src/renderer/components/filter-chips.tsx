import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type FilterChipsProps<T extends string | number> = {
  /** Leading label/icon describing the facet. */
  label: ReactNode;
  options: { value: T; label: string }[];
  selected: T[];
  onToggle: (value: T) => void;
  onClear?: () => void;
  className?: string;
};

/** A row of toggleable filter chips for one facet (tags, states, decks…). */
export function FilterChips<T extends string | number>({
  label,
  options,
  selected,
  onToggle,
  onClear,
  className,
}: FilterChipsProps<T>) {
  if (options.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted">
        {label}
      </span>
      {options.map((opt) => {
        const active = selected.includes(opt.value);
        return (
          <button
            key={String(opt.value)}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(opt.value)}
            className={cn(
              "rounded-sm border px-2 py-0.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              active
                ? "border-accent bg-accent-tint text-accent"
                : "border-border-strong bg-surface text-muted hover:border-border-strong hover:text-ink",
            )}
          >
            {opt.label}
          </button>
        );
      })}
      {onClear && selected.length > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="rounded-sm px-1.5 py-0.5 text-xs font-medium text-muted underline-offset-2 hover:text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Clear
        </button>
      )}
    </div>
  );
}
