import * as React from "react";
import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "min-h-[88px] w-full resize-y rounded-md border border-border-strong bg-surface px-3 py-2 text-sm leading-relaxed text-ink transition-[border-color,box-shadow] duration-150 placeholder:text-muted focus-visible:border-clay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay-tint disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
