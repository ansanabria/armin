import * as React from "react";
import { useLayoutEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * Textarea that grows with its content instead of being manually resizable.
 * Starts at `minHeight`, expands as text is added, and only shows a scrollbar
 * once it reaches `maxHeight` (when set).
 */
export const AutoGrowTextarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
    minHeight: number;
    maxHeight: number;
  }
>(({ value, minHeight, maxHeight, className, style, ...props }, forwardedRef) => {
  const localRef = React.useRef<HTMLTextAreaElement>(null);

  const setRef = React.useCallback(
    (node: HTMLTextAreaElement | null) => {
      localRef.current = node;
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    [forwardedRef],
  );

  useLayoutEffect(() => {
    const el = localRef.current;
    if (!el) return;
    const computed = getComputedStyle(el);
    const border =
      parseFloat(computed.borderTopWidth) +
      parseFloat(computed.borderBottomWidth);
    el.style.height = "auto";
    const content = el.scrollHeight + border;
    el.style.height = `${Math.min(maxHeight, Math.max(minHeight, content))}px`;
    el.style.overflowY = content > maxHeight ? "auto" : "hidden";
  }, [value, minHeight, maxHeight]);

  return (
    <Textarea
      ref={setRef}
      value={value}
      className={cn("resize-none", className)}
      style={{ minHeight, maxHeight, ...style }}
      {...props}
    />
  );
});
AutoGrowTextarea.displayName = "AutoGrowTextarea";
