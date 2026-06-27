const TILE_EASE = "cubic-bezier(0.25, 1, 0.5, 1)";

export const FLASHCARD_TILE_EXIT_MS = 320;

export function liftFlashcardTileFromGrid(tile: HTMLLIElement): HTMLElement[] {
  const grid = tile.parentElement;
  if (!grid) return [];

  const firstRects = new Map<HTMLElement, DOMRect>();
  const siblings: HTMLElement[] = [];
  for (const child of grid.children) {
    if (!(child instanceof HTMLElement) || child === tile) continue;
    firstRects.set(child, child.getBoundingClientRect());
    siblings.push(child);
  }

  const tileRect = tile.getBoundingClientRect();
  const gridRect = grid.getBoundingClientRect();
  tile.style.position = "absolute";
  tile.style.top = `${tileRect.top - gridRect.top + grid.scrollTop}px`;
  tile.style.left = `${tileRect.left - gridRect.left + grid.scrollLeft}px`;
  tile.style.width = `${tileRect.width}px`;
  tile.style.height = `${tileRect.height}px`;
  tile.style.margin = "0";
  tile.style.zIndex = "1";

  const animated: HTMLElement[] = [];
  for (const el of siblings) {
    const first = firstRects.get(el);
    if (!first) continue;
    const last = el.getBoundingClientRect();
    const dx = first.left - last.left;
    const dy = first.top - last.top;
    if (dx === 0 && dy === 0) continue;
    el.style.transform = `translate(${dx}px, ${dy}px)`;
    el.style.transition = "none";
    animated.push(el);
  }

  if (animated.length > 0) {
    requestAnimationFrame(() => {
      for (const el of animated) {
        el.style.transition = `transform ${FLASHCARD_TILE_EXIT_MS}ms ${TILE_EASE}`;
        el.style.transform = "";
      }
    });
  }

  return siblings;
}

export function resetLiftedFlashcardTile(tile: HTMLLIElement | null) {
  if (!tile) return;
  tile.style.position = "";
  tile.style.top = "";
  tile.style.left = "";
  tile.style.width = "";
  tile.style.height = "";
  tile.style.margin = "";
  tile.style.zIndex = "";
}

export function clearFlashcardTileFlipStyles(siblings: HTMLElement[]) {
  for (const el of siblings) {
    el.style.transform = "";
    el.style.transition = "";
  }
}
