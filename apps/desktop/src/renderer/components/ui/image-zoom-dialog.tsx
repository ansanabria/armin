import * as React from "react";
import { createPortal } from "react-dom";
import { Maximize2, X, ZoomIn, ZoomOut } from "lucide-react";

const MIN_SCALE = 0.25;
const MAX_SCALE = 8;
const STEP = 1.2;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/**
 * Centered modal that shows a card image at full size with zoom in/out, reset,
 * scroll-wheel zoom, and drag-to-pan. Used both from the composer (hover
 * magnifier) and the read-only renderer (click image). It is a self-contained
 * portal — not the shared `Dialog` — so its Escape handler can stop at the
 * capture phase and not also close a flashcard form dialog it may be nested in.
 */
export function ImageZoomDialog({
  src,
  open,
  onClose,
}: {
  src: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const [scale, setScale] = React.useState(1);
  const [offset, setOffset] = React.useState({ x: 0, y: 0 });
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef<{
    x: number;
    y: number;
    ox: number;
    oy: number;
  } | null>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const onCloseRef = React.useRef(onClose);
  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    if (!open) return;
    setScale(1);
    setOffset({ x: 0, y: 0 });

    // Pull focus into the preview so its own trap owns Tab from the start; a
    // parent dialog (e.g. the flashcard form) would otherwise keep it.
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusFrame = requestAnimationFrame(() => {
      panelRef.current
        ?.querySelector<HTMLElement>("button:not([disabled])")
        ?.focus();
    });

    const onKey = (event: KeyboardEvent) => {
      // Capture phase + stopImmediatePropagation so a parent dialog's own
      // document-level key handlers (Escape close, Tab trap) never also fire.
      if (event.key === "Escape") {
        event.stopImmediatePropagation();
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key === "Tab") {
        const panel = panelRef.current;
        if (!panel) return;
        event.stopImmediatePropagation();
        const focusables = panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) {
          event.preventDefault();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (active && !panel.contains(active)) {
          event.preventDefault();
          first.focus();
        } else if (event.shiftKey && active === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open]);

  // React attaches wheel listeners passively, so bind our own to preventDefault
  // and keep the page from scrolling while zooming.
  React.useEffect(() => {
    const viewport = viewportRef.current;
    if (!open || !viewport) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setScale((s) => clamp(s * (event.deltaY < 0 ? STEP : 1 / STEP), MIN_SCALE, MAX_SCALE));
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [open]);

  if (!open || !src) return null;

  const zoomBy = (factor: number) =>
    setScale((s) => clamp(s * factor, MIN_SCALE, MAX_SCALE));
  const reset = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  const onPointerDown = (event: React.PointerEvent) => {
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      ox: offset.x,
      oy: offset.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    setOffset({
      x: drag.ox + (event.clientX - drag.x),
      y: drag.oy + (event.clientY - drag.y),
    });
  };
  const endDrag = (event: React.PointerEvent) => {
    dragRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released; ignore.
    }
  };

  const controlClass =
    "flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 cursor-pointer bg-bg/90 animate-fade-in"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Image preview"
        className="relative z-10 flex max-h-[92vh] max-w-[92vw] flex-col items-center animate-pop"
      >
        <div className="absolute right-2 top-2 z-20 flex items-center gap-0.5 rounded-md border border-border bg-surface/90 p-1 shadow-overlay backdrop-blur">
          <button
            type="button"
            className={controlClass}
            onClick={() => zoomBy(1 / STEP)}
            aria-label="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="flex h-8 min-w-[3rem] items-center justify-center gap-1 rounded-md px-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            onClick={reset}
            aria-label="Reset zoom"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            {Math.round(scale * 100)}%
          </button>
          <button
            type="button"
            className={controlClass}
            onClick={() => zoomBy(STEP)}
            aria-label="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={controlClass}
            onClick={onClose}
            aria-label="Close preview"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div
          ref={viewportRef}
          className="overflow-hidden rounded-lg border border-border bg-surface shadow-overlay"
          style={{ cursor: scale > 1 ? "grab" : "default", touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <img
            src={src}
            alt=""
            draggable={false}
            style={{
              display: "block",
              maxWidth: "92vw",
              maxHeight: "85vh",
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              transformOrigin: "center",
              transition: dragRef.current ? "none" : "transform 0.1s ease-out",
              userSelect: "none",
            }}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
