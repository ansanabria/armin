import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
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
import { FlashcardFormDialog } from "@/components/flashcard-form-dialog";
import { FlashcardTile } from "@/components/flashcard-tile";
import { SortControl } from "@/components/sort-control";
import { SearchableMultiSelect } from "@/components/ui/combobox";
import { FLASHCARD_SORT_OPTIONS, type FlashcardSortKey } from "@/lib/sort-flashcards";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import {
  flashcardKeys,
  deckKeys,
  invalidateCoreData,
  type BrowseQueryFilters,
} from "@/lib/armin-query";
import { toUiFlashcard, type UiFlashcard } from "@/types/view-models";
import type { CardFormValues } from "@/components/flashcard-form-dialog";
import { BROWSE_PAGE_SIZE } from "../../shared/browse";

export default function DeckPage() {
  const { deckId } = useParams({ from: "/deck/$deckId" });
  const queryClient = useQueryClient();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UiFlashcard | null>(null);
  const [sort, setSort] = useState<FlashcardSortKey>("due-soon");
  const [tagFilter, setTagFilter] = useState<string[]>([]);

  const browseFilters = useMemo((): BrowseQueryFilters => {
    const filters: BrowseQueryFilters = { sort, deckId };
    if (tagFilter.length > 0) filters.tags = tagFilter;
    return filters;
  }, [sort, deckId, tagFilter]);

  const deckQuery = useQuery({
    queryKey: deckKeys.detail(deckId),
    queryFn: () => window.armin.decks.get(deckId),
  });

  const tagsQuery = useQuery({
    queryKey: flashcardKeys.deckTags(deckId),
    queryFn: () => window.armin.flashcards.listDeckTags(deckId),
  });

  const cardsQuery = useInfiniteQuery({
    queryKey: flashcardKeys.browse(browseFilters),
    queryFn: ({ pageParam }) =>
      window.armin.flashcards.browse({
        offset: pageParam,
        limit: BROWSE_PAGE_SIZE,
        sort: browseFilters.sort,
        deckId: browseFilters.deckId,
        tags: browseFilters.tags,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce(
        (count, page) => count + page.flashcards.length,
        0,
      );
      return loaded < lastPage.filteredTotal ? loaded : undefined;
    },
    placeholderData: keepPreviousData,
  });

  const displayed = useMemo(
    () =>
      (cardsQuery.data?.pages ?? [])
        .flatMap((page) => page.flashcards)
        .map(toUiFlashcard),
    [cardsQuery.data],
  );

  const filteredTotal = cardsQuery.data?.pages[0]?.filteredTotal ?? 0;
  const hasMore = cardsQuery.hasNextPage ?? false;
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel || !hasMore || cardsQuery.isFetchingNextPage) return;

    const root = sentinel.closest(".route-scroll");
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0]?.isIntersecting &&
          cardsQuery.hasNextPage &&
          !cardsQuery.isFetchingNextPage
        ) {
          void cardsQuery.fetchNextPage();
        }
      },
      { root, rootMargin: "240px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [
    hasMore,
    cardsQuery.hasNextPage,
    cardsQuery.isFetchingNextPage,
    cardsQuery.fetchNextPage,
    browseFilters,
  ]);

  const deckTags = tagsQuery.data ?? [];
  const tagOptions = useMemo(
    () => deckTags.map((t) => ({ value: t, label: t })),
    [deckTags],
  );

  const openNew = () => {
    setEditing(null);
    setOpen(true);
  };
  const openEdit = (card: UiFlashcard) => {
    setEditing(card);
    setOpen(true);
  };

  const closeDialog = () => setOpen(false);

  const handleDialogExitComplete = () => {
    setEditing(null);
  };

  const createCard = useMutation({
    mutationFn: (values: CardFormValues) =>
      window.armin.flashcards.create({ deckId, ...values }),
    onSuccess: () => {
      invalidateCoreData(queryClient, deckId);
      toast({ tone: "success", title: "Flashcard added" });
    },
    onError: () => toast({ tone: "error", title: "Couldn’t add flashcard" }),
  });

  const updateCard = useMutation({
    mutationFn: (values: CardFormValues & { id: string }) =>
      window.armin.flashcards.update(values),
    onSuccess: () => {
      invalidateCoreData(queryClient, deckId);
      toast({ tone: "success", title: "Flashcard updated" });
      closeDialog();
    },
    onError: () => toast({ tone: "error", title: "Couldn’t update flashcard" }),
  });

  const deleteCard = useMutation({
    mutationFn: (id: string) => window.armin.flashcards.delete(id),
    onSuccess: () => {
      invalidateCoreData(queryClient, deckId);
      toast({ tone: "error", title: "Flashcard deleted" });
    },
    onError: () => toast({ tone: "error", title: "Couldn’t delete flashcard" }),
  });

  const archiveCard = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      window.armin.flashcards.archive(id, archived),
    onSuccess: (_note, { archived }) => {
      invalidateCoreData(queryClient, deckId);
      toast({
        tone: "success",
        title: archived ? "Flashcard archived" : "Flashcard unarchived",
      });
    },
    onError: () => toast({ tone: "error", title: "Could not update flashcard" }),
  });

  const saveCard = async (values: CardFormValues) => {
    if (editing) await updateCard.mutateAsync({ id: editing.id, ...values });
    else await createCard.mutateAsync(values);
  };

  const deck = deckQuery.data;
  const dueCount = deck?.due ?? 0;
  const deckLoading = deckQuery.isLoading;
  const cardsLoading = cardsQuery.isLoading;
  const isError = deckQuery.isError || cardsQuery.isError;

  if (deckLoading) {
    return (
      <div>
        <BackLink />
        <div className="mt-6">
          <Skeleton className="mb-6 h-16 w-full max-w-md" />
          <CardsSkeleton />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div>
        <BackLink />
        <div className="mt-6">
          <div className="flex flex-col items-center rounded-xl border border-border bg-bg-2 px-6 py-14 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-relearning-bg text-relearning">
              <AlertTriangle className="h-6 w-6" strokeWidth={1.5} />
            </div>
            <h3 className="text-base font-semibold text-ink">
              Couldn&apos;t load these flashcards
            </h3>
            <p className="mt-1 max-w-[40ch] text-sm text-muted">
              Something went wrong reading from local storage. Your data is safe
              on disk.
            </p>
            <Button
              variant="outline"
              className="mt-5"
              onClick={() => {
                void deckQuery.refetch();
                void cardsQuery.refetch();
              }}
            >
              Try again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!deck) {
    return (
      <div>
        <BackLink />
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
      <BackLink />

      <header className="mb-6 mt-4 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[1.75rem] font-semibold tracking-tight text-balance">
            {deck.name}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {deck.total} flashcards
            <span className="text-border-strong"> · </span>
            {deck.learned} learned
            {dueCount > 0 && (
              <>
                <span className="text-border-strong"> · </span>
                <span className="font-medium text-accent">
                  {dueCount} due now
                </span>
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

      {deck.total === 0 && !cardsLoading && (
        <EmptyState
          icon={Layers}
          title="No flashcards in this deck"
          description="Add a flashcard by hand, then connect prerequisites in the graph as the deck grows."
          action={
            <Button onClick={openNew}>
              <Plus className="h-4 w-4" /> Add your first card
            </Button>
          }
        />
      )}

      {deck.total > 0 && (
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
                  <SearchableMultiSelect
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
                <FilterField
                  className="w-44"
                  label={
                    <>
                      <Tag className="h-3.5 w-3.5" aria-hidden /> Tag
                    </>
                  }
                >
                  <p className="flex h-9 items-center text-sm text-muted">
                    No tags
                  </p>
                </FilterField>
              )}
              <SortControl
                fieldLayout
                value={sort}
                onChange={setSort}
                options={FLASHCARD_SORT_OPTIONS}
                triggerClassName="min-w-[11rem]"
              />
            </div>
          </div>

          {cardsLoading && <CardsSkeleton />}

          {!cardsLoading && filteredTotal > 0 && (
            <>
              <p className="mb-3 text-xs text-muted">
                {hasMore
                  ? `Showing ${displayed.length} of ${filteredTotal} flashcards`
                  : `${filteredTotal} flashcards`}
              </p>
              <ul className="card-grid grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {displayed.map((card) => (
                  <FlashcardTile
                    key={card.id}
                    card={card}
                    onOpen={() => openEdit(card)}
                    onArchiveToggle={() =>
                      void archiveCard.mutateAsync({
                        id: card.id,
                        archived: !card.archived,
                      })
                    }
                    onDelete={async () => {
                      await deleteCard.mutateAsync(card.id);
                    }}
                  />
                ))}
              </ul>
              {hasMore || cardsQuery.isFetchingNextPage ? (
                <div
                  ref={loadMoreRef}
                  className="mt-4 flex justify-center py-2"
                  aria-hidden
                >
                  {cardsQuery.isFetchingNextPage ? (
                    <Skeleton className="h-4 w-28" />
                  ) : (
                    <div className="h-px w-full" />
                  )}
                </div>
              ) : null}
            </>
          )}

          {!cardsLoading && filteredTotal === 0 && (
            <p className="border border-border bg-bg-2 px-6 py-10 text-center text-sm text-muted">
              No flashcards match the selected tags.
            </p>
          )}
        </>
      )}

      <FlashcardFormDialog
        open={open}
        onClose={closeDialog}
        onExitComplete={handleDialogExitComplete}
        mode={editing ? "edit" : "create"}
        reviewUnitId={editing?.id ?? null}
        initialType={editing?.type ?? "basic"}
        initialContent={editing?.content ?? null}
        initialTags={editing?.tags ?? []}
        onSubmit={saveCard}
      />
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/"
      className="inline-flex items-center gap-1 rounded-sm text-sm text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <ArrowLeft className="h-4 w-4" /> All decks
    </Link>
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
    <ul className="card-grid grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <li
          key={i}
          className="card-tile-collapse flex min-h-[13.5rem] flex-col border border-border bg-surface p-4"
        >
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-8 w-8 shrink-0" />
          </div>
          <div className="mt-3 flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </li>
      ))}
    </ul>
  );
}
