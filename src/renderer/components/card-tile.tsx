import { memo, useEffect, useMemo, useRef, useState } from "react";
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
import { Dialog } from "@/components/ui/dialog";
import type { UiCard } from "@/types/view-models";
import {
  CARD_TILE_EXIT_MS,
  clearCardTileFlipStyles,
  liftCardTileFromGrid,
  resetLiftedCardTile,
} from "@/lib/card-tile-exit";
import { stripMarkdownForPreview } from "@/lib/markdown-preview";
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

function CardPreviewText({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const text = useMemo(() => stripMarkdownForPreview(content), [content]);
  return <p className={className}>{text || "\u00a0"}</p>;
}

function showDueLabel(card: UiCard) {
  return card.dueLabel !== "New" && card.dueLabel !== "Locked";
}

function CardActionsMenu({
  onOpen,
  onDelete,
  onGoToDeck,
}: {
  onOpen: () => void;
  onDelete: () => void;
  onGoToDeck?: () => void;
}) {
  return (
    <div className="pointer-events-auto shrink-0">
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
            onDelete={onDelete}
            onGoToDeck={onGoToDeck}
            Item={DropdownMenuItem}
            Separator={DropdownMenuSeparator}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export const CardTile = memo(function CardTile({
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
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const cardPreview = useMemo(
    () => stripMarkdownForPreview(card.front),
    [card.front],
  );

  useEffect(() => {
    onDeleteRef.current = onDelete;
  }, [onDelete]);

  const revertExit = (tile: HTMLLIElement | null) => {
    resetLiftedCardTile(tile);
    clearCardTileFlipStyles(flippedSiblingsRef.current);
    flippedSiblingsRef.current = [];
    setExiting(false);
  };

  const openDeleteConfirm = () => {
    if (exiting) return;
    setDeleteConfirmOpen(true);
  };

  const startExitAnimation = () => {
    if (exiting) return;
    const tile = tileRef.current;
    if (!tile) return;
    flippedSiblingsRef.current = liftCardTileFromGrid(tile);
    setExiting(true);
  };

  const confirmDelete = () => {
    setDeleteConfirmOpen(false);
    startExitAnimation();
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
            "group relative flex min-h-[13.5rem] w-full flex-1 cursor-pointer flex-col p-4 transition-[border-color,background-color,box-shadow] duration-150",
            "border border-border bg-surface",
            "hover:border-border-strong hover:bg-surface-sunken hover:shadow-sm",
            card.locked && "opacity-65",
          )}
        >
          <button
            type="button"
            onClick={onOpen}
            aria-label={`View and edit card: ${card.front}`}
            className="absolute inset-0 z-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
          />
          <div className="pointer-events-none relative z-10 flex min-h-0 flex-1 flex-col">
            {deckName ? (
              <div className="flex items-center justify-between gap-2">
                <p className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted">
                  <Layers className="h-3 w-3 shrink-0" aria-hidden />
                  <span className="truncate">{deckName}</span>
                </p>
                <CardActionsMenu
                  onOpen={onOpen}
                  onDelete={openDeleteConfirm}
                  onGoToDeck={onGoToDeck}
                />
              </div>
            ) : null}

            <div
              className={cn(
                "flex items-center gap-2",
                deckName ? "mt-2" : "justify-between",
              )}
            >
              <StateBadge
                state={card.state}
                locked={card.locked}
                className="min-w-0 shrink-0"
              />
              {!deckName && (
                <CardActionsMenu
                  onOpen={onOpen}
                  onDelete={openDeleteConfirm}
                  onGoToDeck={onGoToDeck}
                />
              )}
            </div>

            <div className="mt-3 flex flex-1 flex-col">
              <div className="flex flex-col gap-1">
                <CardPreviewText
                  content={card.front}
                  className="line-clamp-2 text-sm font-medium text-ink"
                />
                <CardPreviewText
                  content={card.back}
                  className="line-clamp-3 text-[0.8125rem] leading-relaxed text-muted"
                />
              </div>

              {(card.tags?.length > 0 || showDueLabel(card)) && (
                <div
                  className={cn(
                    "mt-auto flex items-end gap-3 pt-3",
                    showDueLabel(card) &&
                      (card.tags?.length ? "justify-between" : "justify-end"),
                  )}
                >
                  {card.tags?.length > 0 && (
                    <ul className="flex min-w-0 flex-wrap gap-1">
                      {card.tags.map((tag) => (
                        <li
                          key={tag}
                          className="rounded-sm bg-surface-sunken px-1.5 py-0.5 text-[0.6875rem] font-medium text-muted"
                        >
                          {tag}
                        </li>
                      ))}
                    </ul>
                  )}
                  {showDueLabel(card) && (
                    <span
                      className={cn(
                        "shrink-0 font-mono text-xs tabular-nums",
                        card.dueLabel === "Due now"
                          ? "text-accent"
                          : "text-muted",
                      )}
                    >
                      {card.dueLabel}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </ContextMenuTrigger>

        <ContextMenuContent className="min-w-40">
          <CardActionItems
            onOpen={onOpen}
            onDelete={openDeleteConfirm}
            onGoToDeck={onGoToDeck}
            Item={ContextMenuItem}
            Separator={ContextMenuSeparator}
          />
        </ContextMenuContent>
      </ContextMenu>

      <Dialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title="Delete card?"
        description={
          cardPreview
            ? `“${
                cardPreview.length > 100
                  ? `${cardPreview.slice(0, 100)}…`
                  : cardPreview
              }” will be permanently removed.`
            : "This card will be permanently removed."
        }
      >
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={() => setDeleteConfirmOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={exiting}
            onClick={confirmDelete}
          >
            Delete card
          </Button>
        </div>
      </Dialog>
    </li>
  );
});
