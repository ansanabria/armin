import { useEffect, useRef, useState } from "react";
import { Layers, Pencil, Trash2, EllipsisVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { StateBadge } from "@/components/ui/badge";
import type { UiCard } from "@/types/view-models";
import {
  CARD_TILE_EXIT_MS,
  clearCardTileFlipStyles,
  liftCardTileFromGrid,
  resetLiftedCardTile,
} from "@/lib/card-tile-exit";
import { cn } from "@/lib/utils";

function CardActionItems({
  onOpen,
  onDelete,
  onGoToDeck,
  Item,
  Separator,
}: {
  onOpen: () => void;
  onDelete: () => void;
  onGoToDeck?: () => void;
  Item: typeof DropdownMenuItem;
  Separator: typeof DropdownMenuSeparator;
}) {
  return (
    <>
      <Item onClick={onOpen}>
        <Pencil className="h-4 w-4" />
        Edit card
      </Item>
      {onGoToDeck && (
        <Item onClick={onGoToDeck}>
          <Layers className="h-4 w-4" />
          Go to deck
        </Item>
      )}
      <Separator />
      <Item variant="destructive" onClick={onDelete}>
        <Trash2 className="h-4 w-4" />
        Delete card
      </Item>
    </>
  );
}

export function CardTile({
  card,
  onOpen,
  onDelete,
  onGoToDeck,
  deckName,
}: {
  card: UiCard;
  onOpen: () => void;
  onDelete: () => void | Promise<void>;
  /** When set (e.g. on Browse), adds a menu item to open the card's deck. */
  onGoToDeck?: () => void;
  /** When set (e.g. on the Browse grid), shows the card's deck for context. */
  deckName?: string;
}) {
  const tileRef = useRef<HTMLLIElement>(null);
  const onDeleteRef = useRef(onDelete);
  const flippedSiblingsRef = useRef<HTMLElement[]>([]);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    onDeleteRef.current = onDelete;
  }, [onDelete]);

  const revertExit = (tile: HTMLLIElement | null) => {
    resetLiftedCardTile(tile);
    clearCardTileFlipStyles(flippedSiblingsRef.current);
    flippedSiblingsRef.current = [];
    setExiting(false);
  };

  const requestDelete = () => {
    if (exiting) return;
    const tile = tileRef.current;
    if (!tile) return;
    flippedSiblingsRef.current = liftCardTileFromGrid(tile);
    setExiting(true);
  };

  useEffect(() => {
    if (!exiting) return;

    const tile = tileRef.current;
    let finished = false;

    const finish = async () => {
      if (finished) return;
      finished = true;
      try {
        await Promise.resolve(onDeleteRef.current());
      } catch {
        revertExit(tile);
        return;
      }
      clearCardTileFlipStyles(flippedSiblingsRef.current);
      flippedSiblingsRef.current = [];
    };

    const onTransitionEnd = (event: TransitionEvent) => {
      if (event.target !== tile || event.propertyName !== "opacity") return;
      void finish();
    };

    tile?.addEventListener("transitionend", onTransitionEnd);
    const fallback = window.setTimeout(
      () => void finish(),
      CARD_TILE_EXIT_MS + 50,
    );

    return () => {
      tile?.removeEventListener("transitionend", onTransitionEnd);
      window.clearTimeout(fallback);
    };
  }, [exiting]);

  return (
    <li
      ref={tileRef}
      data-exiting={exiting || undefined}
      className={cn("card-tile-collapse", exiting && "pointer-events-none")}
    >
      <ContextMenu>
        <ContextMenuTrigger
          className={cn(
            "group relative flex h-full flex-col border border-border bg-surface transition-[border-color,background-color,box-shadow] duration-150",
            "hover:border-border-strong hover:bg-surface-sunken hover:shadow-sm",
            card.locked && "opacity-65",
          )}
          render={<div className="h-full" />}
        >
          <button
            type="button"
            onClick={onOpen}
            aria-label={`View and edit card: ${card.front}`}
            className={cn(
              "flex h-full flex-1 flex-col gap-2 p-4 pr-11 text-left",
              "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent",
            )}
          >
            <div className="flex shrink-0 items-center gap-2">
              <StateBadge
                state={card.state}
                locked={card.locked}
                className="w-fit shrink-0"
              />
              {deckName && (
                <span className="inline-flex min-w-0 items-center gap-1 text-xs text-muted">
                  <Layers className="h-3 w-3 shrink-0" aria-hidden />
                  <span className="truncate">{deckName}</span>
                </span>
              )}
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              <p className="line-clamp-2 text-sm font-medium text-ink">
                {card.front}
              </p>
              <p className="mt-2 line-clamp-3 flex-1 text-[0.8125rem] leading-relaxed text-muted">
                {card.back}
              </p>
              <ul className="mt-2.5 flex min-h-[1.375rem] flex-wrap gap-1">
                {card.tags?.map((tag) => (
                  <li
                    key={tag}
                    className="rounded-sm bg-surface-sunken px-1.5 py-0.5 text-[0.6875rem] font-medium text-muted"
                  >
                    {tag}
                  </li>
                ))}
              </ul>
            </div>
            <span
              className={cn(
                "shrink-0 font-mono text-xs",
                card.dueLabel === "Due now" ? "text-accent" : "text-muted",
              )}
            >
              {card.dueLabel}
            </span>
          </button>

          <div className="absolute top-2 right-2 z-10">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Card actions"
                    className="shrink-0"
                  />
                }
              >
                <EllipsisVertical className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-40">
                <CardActionItems
                  onOpen={onOpen}
                  onDelete={requestDelete}
                  onGoToDeck={onGoToDeck}
                  Item={DropdownMenuItem}
                  Separator={DropdownMenuSeparator}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </ContextMenuTrigger>

        <ContextMenuContent className="min-w-40">
          <CardActionItems
            onOpen={onOpen}
            onDelete={requestDelete}
            onGoToDeck={onGoToDeck}
            Item={ContextMenuItem}
            Separator={ContextMenuSeparator}
          />
        </ContextMenuContent>
      </ContextMenu>
    </li>
  );
}
