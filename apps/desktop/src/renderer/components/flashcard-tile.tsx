import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  Layers,
  Pencil,
  Trash2,
  Ellipsis,
  Archive,
  ArchiveRestore,
  FolderInput,
} from "lucide-react";
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
import { StateBadge, Badge } from "@/components/ui/badge";
import { FlashcardTypeBadge } from "@/components/flashcard-type-badge";
import { Dialog } from "@/components/ui/dialog";
import type { UiFlashcard } from "@/types/view-models";
import {
  FLASHCARD_TILE_EXIT_MS,
  clearFlashcardTileFlipStyles,
  liftFlashcardTileFromGrid,
  resetLiftedFlashcardTile,
} from "@/lib/flashcard-tile-exit";
import { stripMarkdownForPreview } from "@/lib/markdown-preview";
import { cn } from "@/lib/utils";
import type { FlashcardDeleteConsequences } from "@/types/window";

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function formatReviewHistory(consequences: FlashcardDeleteConsequences | null) {
  if (!consequences) return "Loading review history…";
  if (consequences.reviewLogCount === 0) {
    return `No review history will be destroyed across ${plural(consequences.reviewUnitCount, "review unit")}.`;
  }

  const first = consequences.firstReviewAt?.toLocaleDateString();
  const last = consequences.lastReviewAt?.toLocaleDateString();
  const span = first && last ? ` from ${first} to ${last}` : "";
  return `${plural(consequences.reviewLogCount, "review log")} across ${plural(consequences.reviewUnitCount, "review unit")} will be destroyed${span}.`;
}

export type FlashcardDeleteRequest = {
  card: UiFlashcard;
  preview: string;
  exiting: boolean;
  canArchive: boolean;
  loadDeleteConsequences?: (
    flashcardId: string,
  ) => Promise<FlashcardDeleteConsequences>;
  archiveInstead: () => Promise<void>;
  confirmDelete: () => void;
};

export function FlashcardDeleteDialog({
  request,
  consequences,
  consequencesError,
  onClose,
  onConfirm,
  onArchiveInstead,
}: {
  request: FlashcardDeleteRequest | null;
  consequences: FlashcardDeleteConsequences | null;
  consequencesError: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onArchiveInstead: () => void;
}) {
  const cardPreview = request?.preview ?? "";

  return (
    <Dialog
      open={Boolean(request)}
      onClose={onClose}
      title="Delete flashcard?"
      description={
        cardPreview
          ? `“${
              cardPreview.length > 100
                ? `${cardPreview.slice(0, 100)}…`
                : cardPreview
            }” will be permanently hard-deleted.`
          : "This flashcard will be permanently hard-deleted."
      }
    >
      <div className="space-y-3 text-sm text-muted">
        <p>
          Archive is the reversible way to set this aside. Delete removes the
          flashcard, its review units, and its review history permanently.
        </p>
        <ul className="space-y-1 rounded-md border border-border bg-surface-sunken p-3">
          <li>
            {consequencesError || !request?.loadDeleteConsequences
              ? "Dependent count could not be loaded."
              : consequences
                ? `${plural(consequences.dependentCount, "dependent")} will be unlocked or recomputed.`
                : "Loading dependent count…"}
          </li>
          <li>
            {consequencesError || !request?.loadDeleteConsequences
              ? "Review history could not be loaded."
              : formatReviewHistory(consequences)}
          </li>
        </ul>
      </div>
      <div className="mt-5 flex flex-wrap justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        {request?.canArchive && !request.card.archived && (
          <Button onClick={onArchiveInstead} disabled={request.exiting}>
            Archive instead
          </Button>
        )}
        <Button
          variant="destructive"
          disabled={
            request?.exiting ||
            Boolean(request?.loadDeleteConsequences && !consequences)
          }
          onClick={onConfirm}
        >
          Delete flashcard
        </Button>
      </div>
    </Dialog>
  );
}

function CardActionItems({
  onOpen,
  onDelete,
  onGoToDeck,
  onMove,
  onArchiveToggle,
  archived,
  Item,
  Separator,
}: {
  onOpen: () => void;
  onDelete: () => void;
  onGoToDeck?: () => void;
  onMove?: () => void;
  onArchiveToggle?: () => void;
  archived?: boolean;
  Item: typeof DropdownMenuItem;
  Separator: typeof DropdownMenuSeparator;
}) {
  return (
    <>
      <Item onClick={onOpen}>
        <Pencil className="h-4 w-4" />
        Edit flashcard
      </Item>
      {onGoToDeck && (
        <Item onClick={onGoToDeck}>
          <Layers className="h-4 w-4" />
          Go to deck
        </Item>
      )}
      {onMove && (
        <Item onClick={onMove}>
          <FolderInput className="h-4 w-4" />
          Move to deck…
        </Item>
      )}
      {onArchiveToggle && (
        <Item onClick={onArchiveToggle}>
          {archived ? (
            <ArchiveRestore className="h-4 w-4" />
          ) : (
            <Archive className="h-4 w-4" />
          )}
          {archived ? "Unarchive" : "Archive"}
        </Item>
      )}
      <Separator />
      <Item variant="destructive" onClick={onDelete}>
        <Trash2 className="h-4 w-4" />
        Delete flashcard
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

function showDueLabel(card: UiFlashcard) {
  return card.dueLabel !== "New" && card.dueLabel !== "Locked";
}

function CardActionsMenu({
  onOpen,
  onDelete,
  onGoToDeck,
  onMove,
  onArchiveToggle,
  archived,
}: {
  onOpen: () => void;
  onDelete: () => void;
  onGoToDeck?: () => void;
  onMove?: () => void;
  onArchiveToggle?: () => void;
  archived?: boolean;
}) {
  return (
    <div className="pointer-events-auto shrink-0">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Flashcard actions"
              className="-mr-2 shrink-0"
            />
          }
        >
          <Ellipsis className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-40">
          <CardActionItems
            onOpen={onOpen}
            onDelete={onDelete}
            onGoToDeck={onGoToDeck}
            onMove={onMove}
            onArchiveToggle={onArchiveToggle}
            archived={archived}
            Item={DropdownMenuItem}
            Separator={DropdownMenuSeparator}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function DeferredCardActionsMenu({
  ready,
  ...props
}: {
  ready: boolean;
  onOpen: () => void;
  onDelete: () => void;
  onGoToDeck?: () => void;
  onMove?: () => void;
  onArchiveToggle?: () => void;
  archived?: boolean;
}) {
  if (!ready) {
    return (
      <div
        className="pointer-events-none -mr-2 h-8 w-8 shrink-0"
        aria-hidden
      />
    );
  }

  return <CardActionsMenu {...props} />;
}

function FlashcardTileBody({
  card,
  deckName,
  onOpen,
  onDelete,
  onGoToDeck,
  onMove,
  onArchiveToggle,
  actionsReady,
}: {
  card: UiFlashcard;
  deckName?: string;
  onOpen: () => void;
  onDelete: () => void;
  onGoToDeck?: () => void;
  onMove?: () => void;
  onArchiveToggle?: () => void | Promise<void>;
  actionsReady: boolean;
}) {
  const actionMenu = (
    <DeferredCardActionsMenu
      ready={actionsReady}
      onOpen={onOpen}
      onDelete={onDelete}
      onGoToDeck={onGoToDeck}
      onMove={onMove}
      onArchiveToggle={
        onArchiveToggle ? () => void onArchiveToggle() : undefined
      }
      archived={card.archived}
    />
  );

  return (
    <div
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
        aria-label={`View and edit flashcard: ${card.front}`}
        className="absolute inset-0 z-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
      />
      <div className="pointer-events-none relative z-10 flex min-h-0 flex-1 flex-col">
        {deckName ? (
          <div className="flex items-center justify-between gap-2">
            <p className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted">
              <Layers className="h-3 w-3 shrink-0" aria-hidden />
              <span className="truncate">{deckName}</span>
            </p>
            {actionMenu}
          </div>
        ) : null}

        <div
          className={cn(
            "flex items-center justify-between gap-2",
            deckName && "mt-2",
          )}
        >
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <StateBadge
              state={card.state}
              locked={card.locked}
              className="min-w-0 shrink-0"
            />
            {card.archived && (
              <Badge className="min-w-0 shrink-0 bg-surface-sunken text-muted">
                <Archive className="h-3 w-3" aria-hidden />
                Archived
              </Badge>
            )}
            <FlashcardTypeBadge type={card.type} />
          </div>
          {!deckName && actionMenu}
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
                    card.dueLabel === "Due now" ? "text-accent" : "text-muted",
                  )}
                >
                  {card.dueLabel}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const FlashcardTile = memo(function FlashcardTile({
  card,
  onOpen,
  onDelete,
  onGoToDeck,
  onMove,
  onArchiveToggle,
  loadDeleteConsequences,
  onDeleteRequest,
  deckName,
}: {
  card: UiFlashcard;
  onOpen: () => void;
  onDelete: () => void | Promise<void>;
  /** When set (e.g. on Browse), adds a menu item to open the card's deck. */
  onGoToDeck?: () => void;
  /** When set, adds a menu item to move the card into another deck. */
  onMove?: () => void;
  /** Toggle archive state for this card. */
  onArchiveToggle?: () => void | Promise<void>;
  loadDeleteConsequences?: (
    flashcardId: string,
  ) => Promise<FlashcardDeleteConsequences>;
  onDeleteRequest: (request: FlashcardDeleteRequest) => void;
  /** When set (e.g. on the Browse grid), shows the card's deck for context. */
  deckName?: string;
}) {
  const tileRef = useRef<HTMLLIElement>(null);
  const onDeleteRef = useRef(onDelete);
  const flippedSiblingsRef = useRef<HTMLElement[]>([]);
  const [exiting, setExiting] = useState(false);
  const [actionsReady, setActionsReady] = useState(false);
  const cardPreview = useMemo(
    () => stripMarkdownForPreview(card.front),
    [card.front],
  );

  useEffect(() => {
    onDeleteRef.current = onDelete;
  }, [onDelete]);

  useEffect(() => {
    if (actionsReady) return;
    const scheduleIdle =
      window.requestIdleCallback ??
      ((callback: IdleRequestCallback) =>
        window.setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 0 }), 120));
    const cancelIdle =
      window.cancelIdleCallback ??
      ((handle: number) => window.clearTimeout(handle));
    const handle = scheduleIdle(() => setActionsReady(true), {
      timeout: 500,
    });
    return () => cancelIdle(handle);
  }, [actionsReady]);

  const revealActions = () => setActionsReady(true);

  const revertExit = (tile: HTMLLIElement | null) => {
    resetLiftedFlashcardTile(tile);
    clearFlashcardTileFlipStyles(flippedSiblingsRef.current);
    flippedSiblingsRef.current = [];
    setExiting(false);
  };

  const openDeleteConfirm = () => {
    if (exiting) return;
    onDeleteRequest({
      card,
      preview: cardPreview,
      exiting,
      canArchive: Boolean(onArchiveToggle),
      loadDeleteConsequences,
      archiveInstead,
      confirmDelete,
    });
  };

  const archiveInstead = async () => {
    if (!onArchiveToggle) return;
    await Promise.resolve(onArchiveToggle());
  };

  const startExitAnimation = () => {
    if (exiting) return;
    const tile = tileRef.current;
    if (!tile) return;
    flippedSiblingsRef.current = liftFlashcardTileFromGrid(tile);
    setExiting(true);
  };

  const confirmDelete = () => {
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
      clearFlashcardTileFlipStyles(flippedSiblingsRef.current);
      flippedSiblingsRef.current = [];
    };

    const onTransitionEnd = (event: TransitionEvent) => {
      if (event.target !== tile || event.propertyName !== "opacity") return;
      void finish();
    };

    tile?.addEventListener("transitionend", onTransitionEnd);
    const fallback = window.setTimeout(
      () => void finish(),
      FLASHCARD_TILE_EXIT_MS + 50,
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
      onPointerEnter={revealActions}
      onFocusCapture={revealActions}
    >
      {actionsReady ? (
        <ContextMenu>
          <ContextMenuTrigger className="contents">
            <FlashcardTileBody
              card={card}
              deckName={deckName}
              onOpen={onOpen}
              actionsReady
              onDelete={openDeleteConfirm}
              onGoToDeck={onGoToDeck}
              onMove={onMove}
              onArchiveToggle={onArchiveToggle}
            />
          </ContextMenuTrigger>

          <ContextMenuContent className="min-w-40">
            <CardActionItems
              onOpen={onOpen}
              onDelete={openDeleteConfirm}
              onGoToDeck={onGoToDeck}
              onMove={onMove}
              onArchiveToggle={
                onArchiveToggle ? () => void onArchiveToggle() : undefined
              }
              archived={card.archived}
              Item={ContextMenuItem}
              Separator={ContextMenuSeparator}
            />
          </ContextMenuContent>
        </ContextMenu>
      ) : (
        <FlashcardTileBody
          card={card}
          deckName={deckName}
          onOpen={onOpen}
          actionsReady={actionsReady}
          onDelete={openDeleteConfirm}
          onGoToDeck={onGoToDeck}
          onMove={onMove}
          onArchiveToggle={onArchiveToggle}
        />
      )}
    </li>
  );
});
