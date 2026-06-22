import { useRef } from "react";

/**
 * Defers an action triggered from inside an overlay (context menu, dropdown,
 * popover) until that overlay has finished closing.
 *
 * Base UI overlays play a close animation when an item is selected. If the
 * item's handler synchronously mutates state the overlay renders from, the
 * overlay's content visibly changes mid-close (e.g. a "Set as default" item
 * morphing into "Remove as default" before it disappears). Queuing the action
 * and running it from `onOpenChangeComplete` lets the overlay close showing
 * unchanged content, then applies the change.
 *
 * Wire `onOpenChangeComplete` to the Base UI Root prop of the same name and
 * wrap each item handler in `defer`:
 *
 *   const menuClose = useMenuCloseAction();
 *   <ContextMenu onOpenChangeComplete={menuClose.onOpenChangeComplete}>
 *     <Item onClick={menuClose.defer(() => setDefault(id))} />
 *
 * Only needed for handlers that change what the still-open overlay renders;
 * handlers with no visible effect on the overlay can stay un-deferred.
 */
export function useMenuCloseAction() {
  const pending = useRef<(() => void) | null>(null);

  const defer = (action: () => void) => () => {
    pending.current = action;
  };

  const onOpenChangeComplete = (open: boolean) => {
    if (open) return;
    const action = pending.current;
    pending.current = null;
    action?.();
  };

  return { defer, onOpenChangeComplete };
}
