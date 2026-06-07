import { useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "@tanstack/react-router";
import {
  ArrowLeft,
  Plus,
  Play,
  Layers,
  AlertTriangle,
  Share2,
  Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardFormDialog } from "@/components/card-form-dialog";
import { CardTile } from "@/components/card-tile";
import { SortControl } from "@/components/sort-control";
import { SearchableSelect } from "@/components/ui/combobox";
import {
  CARD_SORT_OPTIONS,
  sortCards,
  type CardSortKey,
} from "@/lib/sort-cards";
import { matchesTags } from "@/lib/card-filters";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { usePreview } from "@/preview/preview-context";
import {
  getDeck,
  getDeckCards,
  getDeckTags,
  type UiCard,
} from "@/data/fixtures";

export default function DeckPage() {
  const { deckId } = useParams({ from: "/deck/$deckId" });
  const deck = getDeck(deckId);
  const cards = getDeckCards(deckId);

  // UI PREVIEW ONLY: replace `scenario` + fixture reads with real queries.
  const { scenario, setScenario } = usePreview();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UiCard | null>(null);
  const [sort, setSort] = useState<CardSortKey>("due-soon");
  const [tagFilter, setTagFilter] = useState("");

  const deckTags = useMemo(() => getDeckTags(deckId), [deckId]);
  const tagOptions = useMemo(
    () => [
      { value: "", label: "All tags" },
      ...deckTags.map((t) => ({ value: t, label: t })),
    ],
    [deckTags],
  );
  const tags = useMemo(() => (tagFilter ? [tagFilter] : []), [tagFilter]);
  const sortedCards = useMemo(() => sortCards(cards, sort), [cards, sort]);
  const visibleCards = useMemo(
    () => sortedCards.filter((c) => matchesTags(c, tags)),
    [sortedCards, tags],
  );

  const openNew = () => {
    setEditing(null);
    setOpen(true);
  };
  const openEdit = (card: UiCard) => {
    setEditing(card);
    setOpen(true);
  };
  const saveCard = () => {
    toast({
      tone: "success",
      title: editing ? "Card updated" : "Card added",
    });
    setOpen(false);
    setEditing(null);
  };

  const dueCount = cards.filter((c) => c.dueLabel === "Due now").length;

  if (!deck) {
    return (
      <div>
        <Link
          to="/"
          className="inline-flex items-center gap-1 rounded-sm text-sm text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ArrowLeft className="h-4 w-4" /> All decks
        </Link>
        <EmptyState
          className="mt-8"
          icon={Layers}
          title="Deck not found"
          description="This deck doesn't exist in your library. It may have been removed or the link is stale."
          action={
            <Link to="/">
              <Button variant="outline">Back to decks</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div>
      <Link
        to="/"
        className="inline-flex items-center gap-1 rounded-sm text-sm text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <ArrowLeft className="h-4 w-4" /> All decks
      </Link>

      <header className="mb-6 mt-4 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[1.75rem] font-semibold tracking-tight text-balance">
            {deck.name}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {deck.total} cards
            <span className="text-border-strong"> · </span>
            {deck.learned} learned
            {dueCount > 0 && (
              <>
                <span className="text-border-strong"> · </span>
                <span className="font-medium text-accent">{dueCount} due now</span>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/deck/$deckId/graph" params={{ deckId: deck.id }}>
            <Button variant="outline">
              <Share2 className="h-4 w-4" /> Graph
            </Button>
          </Link>
          {dueCount > 0 && (
            <Link to="/deck/$deckId/review" params={{ deckId: deck.id }}>
              <Button>
                <Play className="h-4 w-4" /> Review
              </Button>
            </Link>
          )}
          <Button onClick={openNew}>
            <Plus className="h-4 w-4" /> Add card
          </Button>
        </div>
      </header>

      {scenario === "loading" && <CardsSkeleton />}

      {scenario === "error" && (
        <div className="flex flex-col items-center rounded-xl border border-border px-6 py-14 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-relearning-bg text-relearning">
            <AlertTriangle className="h-6 w-6" strokeWidth={1.5} />
          </div>
          <h3 className="text-base font-semibold text-ink">
            Couldn&apos;t load these cards
          </h3>
          <p className="mt-1 max-w-[40ch] text-sm text-muted">
            Something went wrong reading from local storage. Your data is safe
            on disk.
          </p>
          <Button
            variant="outline"
            className="mt-5"
            onClick={() => setScenario("ready")}
          >
            Try again
          </Button>
        </div>
      )}

      {(scenario === "empty" ||
        (scenario === "ready" && cards.length === 0)) && (
        <EmptyState
          icon={Layers}
          title="No cards in this deck"
          description="Add a card by hand, or point your AI agent at the deck to generate a set from your notes."
          action={
            <Button onClick={openNew}>
              <Plus className="h-4 w-4" /> Add your first card
            </Button>
          }
        />
      )}

      {scenario === "ready" && cards.length > 0 && (
        <>
          <div className="mb-5 border border-border bg-bg-2 px-4 py-3">
            <div className="flex flex-wrap items-end justify-between gap-4">
              {deckTags.length > 0 ? (
                <FilterField
                  className="w-44"
                  label={
                    <>
                      <Tag className="h-3.5 w-3.5" aria-hidden /> Tag
                    </>
                  }
                >
                  <SearchableSelect
                    value={tagFilter}
                    onValueChange={setTagFilter}
                    options={tagOptions}
                    placeholder="All tags"
                    searchPlaceholder="Search tags…"
                    emptyText="No tags found."
                    aria-label="Filter by tag"
                  />
                </FilterField>
              ) : (
                <span />
              )}
              <SortControl
                fieldLayout
                value={sort}
                onChange={setSort}
                options={CARD_SORT_OPTIONS}
                triggerClassName="min-w-[11rem]"
              />
            </div>
          </div>
          {visibleCards.length > 0 ? (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleCards.map((card) => (
                <CardTile
                  key={card.id}
                  card={card}
                  onOpen={() => openEdit(card)}
                  onDelete={() =>
                    toast({ tone: "error", title: "Card deleted" })
                  }
                />
              ))}
            </ul>
          ) : (
            <p className="border border-border px-6 py-10 text-center text-sm text-muted">
              No cards match the selected tags.
            </p>
          )}
        </>
      )}

      <CardFormDialog
        open={open}
        onClose={() => {
          setOpen(false);
          setEditing(null);
        }}
        mode={editing ? "edit" : "create"}
        cardId={editing?.id ?? null}
        initialFront={editing?.front ?? ""}
        initialBack={editing?.back ?? ""}
        initialTags={editing?.tags ?? []}
        onSubmit={saveCard}
      />
    </div>
  );
}

function FilterField({
  label,
  children,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="inline-flex h-3.5 items-center gap-1.5 text-xs font-medium text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

function CardsSkeleton() {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="flex flex-col gap-2 border border-border p-4 pr-11">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="mt-1 h-3 w-16" />
        </li>
      ))}
    </ul>
  );
}
