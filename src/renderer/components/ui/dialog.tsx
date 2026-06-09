import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const EXIT_MS = 200;

/**
 * Accessible modal: portaled to <body> (escapes stacking contexts), focus is
 * trapped while open and restored on close, Escape and backdrop-click dismiss.
 */
export function Dialog({
  open,
  onClose,
  onExitComplete,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  onExitComplete?: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const onCloseRef = React.useRef(onClose);
  const onExitCompleteRef = React.useRef(onExitComplete);
  const previouslyFocusedRef = React.useRef<HTMLElement | null>(null);
  const titleId = React.useId();
  const [present, setPresent] = React.useState(open);
  const [closing, setClosing] = React.useState(false);
  const snapshotRef = React.useRef({ title, description, children });
  const exiting = closing || (present && !open);

  if (open && !exiting) {
    snapshotRef.current = { title, description, children };
  }

  const content = exiting
    ? snapshotRef.current
    : { title, description, children };

  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    onExitCompleteRef.current = onExitComplete;
  }, [onExitComplete]);

  React.useEffect(() => {
    if (open) {
      setPresent(true);
      setClosing(false);
    } else if (present) {
      setClosing(true);
    }
  }, [open, present]);

  React.useEffect(() => {
    if (!present || exiting) return;

    const panel = panelRef.current;
    const focusFrame = requestAnimationFrame(() => {
      const autofocusHost =
        panel?.querySelector<HTMLElement>("[data-autofocus]");
      const target =
        autofocusHost?.querySelector<HTMLElement>('[contenteditable="true"]') ??
        panel?.querySelector<HTMLElement>('[contenteditable="true"]') ??
        panel?.querySelector<HTMLElement>(
          "[autofocus], input, textarea, select",
        );
      target?.focus();
    });

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key === "Tab" && panel) {
        const focusables = panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [contenteditable="true"], [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [present, exiting]);

  React.useEffect(() => {
    if (!closing) return;

    let finished = false;
    const finishClose = () => {
      if (finished) return;
      finished = true;
      previouslyFocusedRef.current?.focus?.();
      setPresent(false);
      setClosing(false);
      onExitCompleteRef.current?.();
    };

    const panel = panelRef.current;
    const onEnd = (event: AnimationEvent) => {
      if (event.target !== panel) return;
      finishClose();
    };

    panel?.addEventListener("animationend", onEnd);
    const fallback = window.setTimeout(finishClose, EXIT_MS + 50);

    return () => {
      panel?.removeEventListener("animationend", onEnd);
      window.clearTimeout(fallback);
    };
  }, [closing]);

  if (!present) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className={cn(
          "absolute inset-0 cursor-pointer bg-ink/35",
          exiting ? "animate-fade-out" : "animate-fade-in",
        )}
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={content.title ? titleId : undefined}
        className={cn(
          "relative z-10 w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-overlay",
          exiting ? "animate-pop-out" : "animate-pop",
          className,
        )}
      >
        {content.title && (
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 id={titleId} className="text-lg font-semibold text-ink">
                {content.title}
              </h2>
              {content.description && (
                <p className="mt-1 text-sm text-muted">{content.description}</p>
              )}
            </div>
            <button
              onClick={onClose}
              aria-label="Close dialog"
              className="-mr-1.5 -mt-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {content.children}
      </div>
    </div>,
    document.body,
  );
}
