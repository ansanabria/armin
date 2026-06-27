import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Empty state that teaches the interface rather than just saying "nothing
 * here." Dashed border keeps it visually distinct from a populated surface.
 *
 * Use `bare` when the empty state already sits inside its own card or window
 * (e.g. the profile picker) so it doesn't render a nested card.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  bare = false,
}: {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  bare?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center px-6 text-center",
        bare
          ? "py-10"
          : "rounded-xl border border-dashed border-border-strong bg-bg-2 py-14",
        className,
      )}
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent-tint text-accent-deep">
        <Icon className="h-6 w-6" strokeWidth={1.5} aria-hidden />
      </div>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description && (
        <p className="mt-1 max-w-[42ch] text-pretty text-sm text-muted">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
