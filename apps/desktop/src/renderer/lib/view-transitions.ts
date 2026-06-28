export const VIEW_TRANSITIONS_STORAGE_KEY = "armin-view-transitions-enabled";

/**
 * Whether the app plays View Transition animations between routes and in-place
 * content swaps. Disabling it makes those swaps instant, mirroring what
 * `prefers-reduced-motion: reduce` already does (see `index.css`), without
 * touching the rest of the app's motion.
 */
export function readViewTransitionsEnabled(): boolean {
  try {
    // Default on: only an explicit opt-out disables transitions.
    return localStorage.getItem(VIEW_TRANSITIONS_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

export function storeViewTransitionsEnabled(enabled: boolean) {
  try {
    localStorage.setItem(
      VIEW_TRANSITIONS_STORAGE_KEY,
      enabled ? "true" : "false",
    );
  } catch {
    /* ignore quota / privacy mode */
  }
}

/**
 * Reflect the preference as a `data-view-transitions` attribute on `<html>` so
 * the CSS can short-circuit the route-transition pseudo-elements to an instant
 * swap. Non-React consumers read the same preference directly.
 */
export function applyViewTransitionsPreference(enabled: boolean) {
  if (enabled) {
    delete document.documentElement.dataset.viewTransitions;
  } else {
    document.documentElement.dataset.viewTransitions = "off";
  }
}
