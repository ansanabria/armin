import { useCallback, useLayoutEffect, useRef, useState } from "react";

import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Tracks whether the referenced element's content is clipped horizontally
 * (`scrollWidth > clientWidth`). Re-measures via a `ResizeObserver`, so it stays
 * correct when the container width changes (e.g. a popup anchored to a trigger).
 */
export function useIsTruncated<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [truncated, setTruncated] = useState(false);

  const measure = useCallback(() => {
    const el = ref.current;
    if (el) setTruncated(el.scrollWidth > el.clientWidth);
  }, []);

  useLayoutEffect(() => {
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  });

  return { ref, truncated, measure };
}

/**
 * Single-line label that fills the available width and ellipsizes when it
 * overflows. Only when the text is actually clipped does it expose the full
 * value through a hover/focus tooltip, so short labels stay tooltip-free.
 */
export function TruncatedLabel({
  label,
  side = "top",
  className,
}: {
  label: string;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}) {
  const { ref, truncated } = useIsTruncated<HTMLSpanElement>();

  const span = (
    <span
      ref={ref}
      className={cn("block min-w-0 flex-1 truncate text-left", className)}
    >
      {label}
    </span>
  );

  if (!truncated) return span;
  return (
    <Tooltip content={label} side={side}>
      {span}
    </Tooltip>
  );
}
