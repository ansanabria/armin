import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-9 w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-ink transition-[border-color,box-shadow] duration-150 placeholder:text-muted focus-visible:border-clay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay-tint disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";
