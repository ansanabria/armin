import * as React from "react";
import { Loader2, SendHorizontal, Square, X } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Composer primitives modeled on shadcn's AI Elements <PromptInput>, themed with
 * Armin's Flexoki tokens. The whole control is one focus-within bordered field:
 * an auto-growing textarea stacked over a toolbar. Enter sends; Shift+Enter adds
 * a newline — the convention every chat surface shares.
 */
export function PromptInput({
  className,
  onSubmit,
  children,
  ...props
}: Omit<React.FormHTMLAttributes<HTMLFormElement>, "onSubmit"> & {
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.(event);
      }}
      className={cn(
        "rounded-xl border border-border-strong bg-surface transition-[border-color,box-shadow] duration-150 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-tint",
        className,
      )}
      {...props}
    >
      {children}
    </form>
  );
}

export const PromptInputTextarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
    minHeight?: number;
    maxHeight?: number;
  }
>(
  (
    {
      className,
      onKeyDown,
      value,
      minHeight = 44,
      maxHeight = 176,
      ...props
    },
    forwardedRef,
  ) => {
    const localRef = React.useRef<HTMLTextAreaElement>(null);

    const setRef = React.useCallback(
      (node: HTMLTextAreaElement | null) => {
        localRef.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      },
      [forwardedRef],
    );

    React.useLayoutEffect(() => {
      const element = localRef.current;
      if (!element) return;
      element.style.height = "auto";
      const next = Math.min(maxHeight, Math.max(minHeight, element.scrollHeight));
      element.style.height = `${next}px`;
      element.style.overflowY = element.scrollHeight > maxHeight ? "auto" : "hidden";
    }, [value, minHeight, maxHeight]);

    return (
      <textarea
        ref={setRef}
        value={value}
        rows={1}
        style={{ minHeight, maxHeight }}
        className={cn(
          "w-full resize-none bg-transparent px-3.5 py-3 text-sm leading-relaxed text-ink outline-none placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
          onKeyDown?.(event);
        }}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        {...props}
      />
    );
  },
);
PromptInputTextarea.displayName = "PromptInputTextarea";

export function PromptInputToolbar({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center justify-between gap-2 px-2 pb-2", className)}
      {...props}
    />
  );
}

export function PromptInputTools({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex items-center gap-1", className)} {...props} />
  );
}

type PromptInputSubmitStatus = "ready" | "submitted" | "streaming" | "error";

const STATUS_ICON: Record<PromptInputSubmitStatus, typeof SendHorizontal> = {
  ready: SendHorizontal,
  submitted: Loader2,
  streaming: Square,
  error: X,
};

export function PromptInputSubmit({
  status = "ready",
  className,
  children,
  ...props
}: ButtonProps & { status?: PromptInputSubmitStatus }) {
  const Icon = STATUS_ICON[status];
  return (
    <Button
      type="submit"
      size="icon-sm"
      className={cn("rounded-lg", className)}
      {...props}
    >
      {children ?? (
        <Icon
          className={cn("h-4 w-4", status === "submitted" && "animate-spin")}
        />
      )}
    </Button>
  );
}
