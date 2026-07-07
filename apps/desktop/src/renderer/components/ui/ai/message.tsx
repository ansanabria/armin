import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Chat message primitives modeled on shadcn's AI Elements, themed with Armin's
 * Flexoki tokens. `<Message from>` sets the row alignment and a `data-from`
 * group flag that `<MessageContent>` reads to pick the bubble treatment: the
 * accent bubble for the learner, a sunken surface bubble for the Assistant.
 */
export function Message({
  from,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { from: "user" | "assistant" }) {
  return (
    <div
      data-from={from}
      className={cn(
        "group flex w-full",
        from === "user" ? "justify-end" : "justify-start",
        className,
      )}
      {...props}
    />
  );
}

export function MessageContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "max-w-[85%] overflow-hidden rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
        "group-data-[from=user]:bg-accent group-data-[from=user]:text-on-accent",
        "group-data-[from=assistant]:border group-data-[from=assistant]:border-border group-data-[from=assistant]:bg-surface-sunken group-data-[from=assistant]:text-ink",
        className,
      )}
      {...props}
    />
  );
}

/** Three-dot "typing" indicator shown in an Assistant bubble before its first token. */
export function MessageLoader({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 py-1", className)}
      role="status"
      aria-label="Assistant is thinking"
    >
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="h-1.5 w-1.5 rounded-full bg-muted animate-typing"
          style={{ animationDelay: `${index * 160}ms` }}
        />
      ))}
    </span>
  );
}
