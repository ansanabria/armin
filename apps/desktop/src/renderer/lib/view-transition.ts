import { flushSync } from "react-dom";
import { readViewTransitionsEnabled } from "@/lib/view-transitions";

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => unknown;
};

/**
 * Run a React state update inside a View Transition so an in-place DOM swap
 * animates through the shared `route-content` transition (see `index.css`)
 * instead of cutting abruptly. This is the manual counterpart to the router's
 * `defaultViewTransition` for swaps that change rendered content without
 * navigating (e.g. the cram menu giving way to a drill session).
 *
 * Falls back to a plain synchronous update when the browser lacks the API, the
 * user prefers reduced motion, or has turned off view transitions in settings.
 */
export function withViewTransition(update: () => void): void {
  const doc = document as ViewTransitionDocument;
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  if (
    typeof doc.startViewTransition !== "function" ||
    prefersReducedMotion ||
    !readViewTransitionsEnabled()
  ) {
    update();
    return;
  }
  doc.startViewTransition(() => {
    flushSync(update);
  });
}
