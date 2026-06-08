import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Tag, Layers, AlertTriangle, Library, CircleDot } from "lucide-react";
import { CardFormDialog } from "@/components/card-form-dialog";
import { CardTile } from "@/components/card-tile";
import { SortControl } from "@/components/sort-control";
import { SearchableSelect } from "@/components/ui/combobox";
import { type CardState } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { usePreview } from "@/preview/preview-context";
import { decks, getAllCards, type UiCard } from "@/data/fixtures";
import {
  BROWSE_SORT_OPTIONS,
  sortBrowseCards,
  type BrowseSortKey,
} from "@/lib/browse";
import {
  STATE_OPTIONS,
  matchesDecks,
  matchesStates,
  matchesTags,
} from "@/lib/card-filters";
import { cn } from "@/lib/utils";

const ALL_STATES = "all";

export default function BrowsePage() {
  // UI PREVIEW ONLY: `scenario` stands in for the cards query status.
  const { scenario, setScenario } = usePreview();
  const navigate = useNavigate();
  const toast = useToast();

  const all = useMemo(() => getAllCards(), []);

  const [sort, setSort] = useState<BrowseSortKey>("created-new");
  const [stateFilter, setStateFilter] = useState<string>(ALL_STATES);
  const [deckFilter, setDeckFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UiCard | null>(null);

  const openEdit = (card: UiCard) => {
    setEditing(card);
    setOpen(true);
  };

  const saveCard = () => {
    toast({
      tone: "success",
      title: "Card updated",
    });
    setOpen(false);
    setEditing(null);
  };

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const card of all) for (const tag of card.tags ?? []) set.add(tag);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [all]);

  const deckOptions = useMemo(
    () => [
      { value: "", label: "All decks" },
      ...decks.map((d) => ({ value: d.id, label: d.name })),
    ],
    [],
  );

  const tagOptions = useMemo(
    () => [
      { value: "", label: "All tags" },
      ...allTags.map((t) => ({ value: t, label: t })),
    ],
    [allTags],
  );

  const stateItems = useMemo(
    () => [
      { value: ALL_STATES, label: "All states" },
      ...STATE_OPTIONS.map((o) => ({ value: String(o.value), label: o.label })),
    ],
    [],
  );

  const states = useMemo((): CardState[] => {
    if (stateFilter === ALL_STATES) return [];
    const n = Number(stateFilter);
    return Number.isInteger(n) ? [n as CardState] : [];
  }, [stateFilter]);

  const deckIds = useMemo(() => (deckFilter ? [deckFilter] : []), [deckFilter]);

  const tags = useMemo(() => (tagFilter ? [tagFilter] : []), [tagFilter]);

  const visible = useMemo(() => {
    const filtered = all.filter(
      (c) =>
        matchesStates(c, states) &&
        matchesDecks(c, deckIds) &&
        matchesTags(c, tags),
    );
    return sortBrowseCards(filtered, sort);
  }, [all, states, deckIds, tags, sort]);

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-balance">
          Browse
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          Every card across your decks. Filter and sort to find anything.
        </p>
      </header>

      {scenario === "loading" && <BrowseSkeleton />}

      {scenario === "error" && (
        <div className="flex flex-col items-center border border-border px-6 py-14 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center bg-relearning-bg text-relearning">
            <AlertTriangle className="h-6 w-6" strokeWidth={1.5} />
          </div>
          <h3 className="text-base font-semibold text-ink">
            Couldn&apos;t load your cards
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

      {scenario === "empty" && (
        <EmptyState
          icon={Library}
          title="No cards yet"
          description="Create a deck and add cards, or generate them with your AI agent. They'll all show up here."
          action={
            <Link to="/">
              <Button variant="outline">Go to decks</Button>
            </Link>
          }
        />
      )}

      {scenario === "ready" && (
        <>
          <div className="mb-5 border border-border bg-bg-2 px-4 py-3">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex flex-wrap items-end gap-4">
                <FilterField
                  className="w-36"
                  label={
                    <>
                      <CircleDot className="h-3.5 w-3.5" aria-hidden /> State
                    </>
                  }
                >
                  <Select
                    value={stateFilter}
                    items={stateItems}
                    onValueChange={(value) =>
                      setStateFilter(value ?? ALL_STATES)
                    }
                  >
                    <SelectTrigger
                      className="w-full border-border-strong bg-surface"
                      aria-label="Filter by state"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false}>
                      <SelectGroup>
                        <SelectItem value={ALL_STATES}>All states</SelectItem>
                        {STATE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={String(opt.value)}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </FilterField>

                <FilterField
                  className="w-52"
                  label={
                    <>
                      <Layers className="h-3.5 w-3.5" aria-hidden /> Deck
                    </>
                  }
                >
                  <SearchableSelect
                    value={deckFilter}
                    onValueChange={setDeckFilter}
                    options={deckOptions}
                    placeholder="All decks"
                    searchPlaceholder="Search decks…"
                    emptyText="No decks found."
                    aria-label="Filter by deck"
                  />
                </FilterField>

                {allTags.length > 0 && (
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
                )}
              </div>
              <SortControl
                fieldLayout
                value={sort}
                onChange={setSort}
                options={BROWSE_SORT_OPTIONS}
                triggerClassName="min-w-[11rem]"
              />
            </div>
          </div>

          <p className="mb-3 text-xs text-muted">
            {visible.length} of {all.length} cards
          </p>

          {visible.length > 0 ? (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((card) => (
                <CardTile
                  key={`${card.deckId}-${card.id}`}
                  card={card}
                  deckName={card.deckName}
                  onOpen={() => openEdit(card)}
                  onGoToDeck={() =>
                    navigate({
                      to: "/deck/$deckId",
                      params: { deckId: card.deckId },
                    })
                  }
                  onDelete={() =>
                    toast({ tone: "error", title: "Card deleted" })
                  }
                />
              ))}
            </ul>
          ) : (
            <p className="border border-border px-6 py-10 text-center text-sm text-muted">
              No cards match the current filters.
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
        mode="edit"
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

function BrowseSkeleton() {
  return (
    <div>
      <Skeleton className="mb-5 h-24 w-full" />
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <li
            key={i}
            className="flex flex-col gap-2 border border-border p-4 pr-11"
          >
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="mt-1 h-3 w-16" />
          </li>
        ))}
      </ul>
    </div>
  );
}
