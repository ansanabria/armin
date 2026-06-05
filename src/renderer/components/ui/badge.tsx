import * as React from "react";
import { Lock, Plus, RotateCcw, Check, GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";

/** FSRS card states: 0=New, 1=Learning, 2=Review, 3=Relearning. */
export type CardState = 0 | 1 | 2 | 3;

export function Badge({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-medium",
        className,
      )}
      {...props}
    />
  );
}

const STATE_CONFIG: Record<
  CardState,
  { label: string; cls: string; Icon: typeof Plus }
> = {
  0: { label: "New", cls: "bg-new-bg text-new", Icon: Plus },
  1: { label: "Learning", cls: "bg-learning-bg text-learning", Icon: GraduationCap },
  2: { label: "Review", cls: "bg-review-bg text-review", Icon: Check },
  3: { label: "Relearning", cls: "bg-relearning-bg text-relearning", Icon: RotateCcw },
};

/**
 * Card-state chip. Color is always paired with a text label (and icon), so
 * meaning survives color-blindness. A locked card overrides the state.
 */
export function StateBadge({
  state,
  locked = false,
  className,
}: {
  state: CardState;
  locked?: boolean;
  className?: string;
}) {
  if (locked) {
    return (
      <Badge className={cn("bg-surface-sunken text-muted", className)}>
        <Lock className="h-3 w-3" aria-hidden />
        Locked
      </Badge>
    );
  }
  const { label, cls, Icon } = STATE_CONFIG[state];
  return (
    <Badge className={cn(cls, className)}>
      <Icon className="h-3 w-3" aria-hidden />
      {label}
    </Badge>
  );
}
