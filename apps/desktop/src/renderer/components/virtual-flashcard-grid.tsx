import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Skeleton } from "@/components/ui/skeleton";
import type { UiFlashcard } from "@/types/view-models";

const GRID_GAP_PX = 16;
const CARD_MIN_HEIGHT_PX = 216;

function getColumnCount(width: number) {
  if (width >= 1024) return 3;
  if (width >= 640) return 2;
  return 1;
}

function chunkCards(cards: UiFlashcard[], columns: number) {
  const rows: UiFlashcard[][] = [];
  for (let index = 0; index < cards.length; index += columns) {
    rows.push(cards.slice(index, index + columns));
  }
  return rows;
}

export function VirtualFlashcardGrid({
  cards,
  hasMore,
  isFetchingNextPage,
  fetchNextPage,
  renderCard,
}: {
  cards: UiFlashcard[];
  hasMore: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  renderCard: (card: UiFlashcard) => ReactNode;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [scrollElement, setScrollElement] = useState<Element | null>(null);
  // `columns` is the single source of truth for the grid: it sizes both the
  // chunking below and the rendered `grid-template-columns`, so every row holds
  // exactly as many cards as it renders. It keys off the viewport width to
  // match the app's Tailwind breakpoints (e.g. the loading skeleton's
  // `sm:`/`lg:` grid), keeping the column count consistent across the route.
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? 0 : window.innerWidth,
  );

  useEffect(() => {
    const element = parentRef.current;
    if (element) {
      setScrollElement(element.closest(".route-scroll"));
    }

    const updateWidth = () => setViewportWidth(window.innerWidth);
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  const columns = getColumnCount(viewportWidth);
  const rows = useMemo(() => chunkCards(cards, columns), [cards, columns]);
  // Pre-build the tile elements once per data/layout change. Scrolling re-renders
  // this component as the virtual range moves, but the memo hands back the exact
  // same element objects for rows that haven't changed, so React bails out of
  // re-rendering those tiles (and their heavy Base UI menu trees) instead of
  // rebuilding them every scroll step. Only rows entering the window mount.
  const renderedRows = useMemo(
    () => rows.map((row) => row.map((card) => renderCard(card))),
    [rows, renderCard],
  );
  const loaderRowIndex = rows.length;
  const rowCount = rows.length + (hasMore ? 1 : 0);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollElement,
    estimateSize: () => CARD_MIN_HEIGHT_PX + GRID_GAP_PX,
    overscan: 4,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();

  useEffect(() => {
    const lastItem = virtualRows[virtualRows.length - 1];
    if (
      !lastItem ||
      !hasMore ||
      isFetchingNextPage ||
      lastItem.index < loaderRowIndex
    ) {
      return;
    }
    fetchNextPage();
  }, [
    fetchNextPage,
    hasMore,
    isFetchingNextPage,
    loaderRowIndex,
    virtualRows,
  ]);

  return (
    <div ref={parentRef} className="relative w-full">
      <div
        className="relative w-full"
        style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
      >
        {virtualRows.map((virtualRow) => {
          const isLoaderRow = virtualRow.index === loaderRowIndex;

          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              className="absolute left-0 top-0 w-full"
              style={{
                transform: `translateY(${virtualRow.start}px)`,
                paddingBottom: GRID_GAP_PX,
              }}
            >
              {isLoaderRow ? (
                <div className="flex justify-center py-2" aria-hidden>
                  {isFetchingNextPage ? (
                    <Skeleton className="h-4 w-28" />
                  ) : (
                    <div className="h-px w-full" />
                  )}
                </div>
              ) : (
                <ul
                  className="card-grid grid gap-4"
                  style={{
                    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                  }}
                >
                  {renderedRows[virtualRow.index]}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
