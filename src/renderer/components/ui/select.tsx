import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Styled native select: standard affordance, no reinvented control. */
export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <div className="relative">
    <select
      ref={ref}
      className={cn(
        "h-9 w-full appearance-none rounded-md border border-border-strong bg-surface pl-3 pr-9 text-sm text-ink transition-[border-color,box-shadow] duration-150 focus-visible:border-clay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay-tint disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </select>
    <ChevronDown
      className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
      aria-hidden
    />
  </div>
));
Select.displayName = "Select";
