import * as React from "react";
import { cn } from "@/lib/utils";

/** A keyboard-key hint. This is a keyboard-first app; shortcuts are visible. */
export function Kbd({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border border-border-strong bg-surface px-1.5 font-mono text-[0.6875rem] font-medium text-muted shadow-[0_1px_0_var(--color-border-strong)]",
        className,
      )}
      {...props}
    />
  );
}
