import type { ParsedLocation } from "@tanstack/react-router";

type LocationChangeInfo = {
  fromLocation?: ParsedLocation;
  toLocation: ParsedLocation;
  pathChanged: boolean;
  hrefChanged: boolean;
  hashChanged: boolean;
};

function tabIndex(pathname: string): number {
  if (pathname === "/" || pathname.startsWith("/deck/")) return 0;
  if (pathname === "/review") return 1;
  if (pathname === "/browse") return 2;
  if (pathname === "/settings") return 3;
  return -1;
}

function pathDepth(pathname: string): number {
  return pathname.split("/").filter(Boolean).length;
}

function isGraphPath(pathname: string): boolean {
  return pathname.endsWith("/graph");
}

/**
 * Picks a view-transition type for each navigation.
 * @see https://tanstack.com/router/v1/docs/framework/react/examples/view-transitions
 */
export function resolveViewTransitionTypes(
  info: LocationChangeInfo,
): string[] | false {
  const { fromLocation, toLocation, pathChanged } = info;

  if (!pathChanged) return false;

  const from = fromLocation?.pathname ?? "";
  const to = toLocation.pathname;

  if (isGraphPath(from) || isGraphPath(to)) {
    return ["fade"];
  }

  // Skip the initial route commit — the document isn't ready for a transition yet
  // and this avoids "Transition was aborted because of invalid state" on load.
  if (!fromLocation) {
    return false;
  }

  const fromTab = tabIndex(from);
  const toTab = tabIndex(to);

  if (fromTab !== toTab && fromTab >= 0 && toTab >= 0) {
    return [fromTab > toTab ? "slide-right" : "slide-left"];
  }

  if (fromTab === toTab && fromTab >= 0) {
    const depthDelta = pathDepth(to) - pathDepth(from);
    if (depthDelta > 0) return ["slide-forward"];
    if (depthDelta < 0) return ["slide-back"];
    return ["fade"];
  }

  const fromHistory = fromLocation.state.__TSR_index;
  const toHistory = toLocation.state.__TSR_index;
  if (typeof fromHistory === "number" && typeof toHistory === "number") {
    return [fromHistory > toHistory ? "slide-right" : "slide-left"];
  }

  return ["fade"];
}

/**
 * View transitions reject their `finished` promise when a newer navigation
 * supersedes an in-flight transition. TanStack Router doesn't catch that, so
 * wire it here to keep DevTools clean during fast tab switches.
 */
export function installViewTransitionRejectionHandler(): void {
  if (
    typeof document === "undefined" ||
    !("startViewTransition" in document) ||
    typeof document.startViewTransition !== "function"
  ) {
    return;
  }

  const original = document.startViewTransition.bind(document);
  document.startViewTransition = (updateCallbackOrOptions) => {
    const transition = original(updateCallbackOrOptions);
    void transition.finished.catch(() => {});
    return transition;
  };
}
