import * as React from "react";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";

import { cn } from "@/lib/utils";

/**
 * Lightweight hover/focus tooltip built on Base UI. The popup is portaled, so
 * it sits above modal dialogs; `content` may be rich JSX, not just a string.
 */
export function Tooltip({
  children,
  content,
  side = "top",
  sideOffset = 6,
  delay = 150,
  className,
}: {
  children: React.ReactElement<Record<string, unknown>>;
  content: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  sideOffset?: number;
  delay?: number;
  className?: string;
}) {
  return (
    <TooltipPrimitive.Provider delay={delay}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger render={children} />
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Positioner
            className="z-[60] outline-none"
            side={side}
            sideOffset={sideOffset}
          >
            <TooltipPrimitive.Popup
              className={cn(
                "max-w-xs origin-(--transform-origin) rounded-lg border border-border bg-surface px-3 py-2.5 text-xs leading-relaxed text-ink shadow-overlay outline-none duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
                className,
              )}
            >
              {content}
            </TooltipPrimitive.Popup>
          </TooltipPrimitive.Positioner>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
