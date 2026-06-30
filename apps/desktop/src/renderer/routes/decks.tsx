import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Layers,
  Plus,
  Upload,
  AlertTriangle,
  Ellipsis,
  Pencil,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AutoGrowTextarea } from "@/components/ui/auto-grow-textarea";
import { Dialog } from "@/components/ui/dialog";
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
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { SortControl } from "@/components/sort-control";
import {
  ImportDeckDialog,
  type ImportSummary,
} from "@/components/import-deck-dialog";
import { useToast } from "@/components/ui/toast";
import {
  DECK_SORT_OPTIONS,
  sortDecks,
  type DeckSortKey,
} from "@/lib/sort-decks";
import {
  deckKeys,
  flashcardKeys,
  invalidateDeckScopedData,
} from "@/lib/armin-query";
import type { UiDeck } from "@/types/view-models";
import type { BrowseFlashcard } from "@/types/window";
import { BROWSE_PAGE_SIZE } from "../../shared/browse";

type BrowsePageResult = {
  flashcards: BrowseFlashcard[];
  filteredTotal: number;
  libraryTotal: number;
};

const IMPORT_TYPE_LABELS: Record<string, string> = {
  basic: "Basic",
  basic_reversed: "Reversed",
  cloze: "Cloze",
  type_answer: "Type answer",
  image_occlusion: "Image occlusion",
};

function importToastDescription(summary: ImportSummary, deckLabel: string) {
  const lines = [`${summary.cardCount} flashcards added to ${deckLabel}.`];
  if (summary.importedTypes?.length) {
    lines.push(
      `Types: ${summary.importedTypes
        .map(({ type, count }) => `${IMPORT_TYPE_LABELS[type] ?? type} ${count}`)
        .join(", ")}.`,
    );
  }
  if (summary.skippedCount && summary.skippedCount > 0) {
    const reasons = [...new Set(summary.skippedNotes?.map((note) => note.reason))];
    lines.push(
      `${summary.skippedCount} skipped${reasons.length ? `: ${reasons.join("; ")}` : ""}.`,
    );
  }
  return lines.join(" ");
}

export default function DecksPage() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [closingAfterCreate, setClosingAfterCreate] = useState(false);
  const [sort, setSort] = useState<DeckSortKey>("name-asc");
  const [renameOpen, setRenameOpen] = useState(false);
  const [renamingDeck, setRenamingDeck] = useState<UiDeck | null>(null);
  const [renameName, setRenameName] = useState("");
  const [closingAfterRename, setClosingAfterRename] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingDeck, setDeletingDeck] = useState<UiDeck | null>(null);
  const [closingAfterDelete, setClosingAfterDelete] = useState(false);
  const prefetchedDecksRef = useRef<Set<string>>(new Set());

  const decksQuery = useQuery({
    queryKey: deckKeys.all,
    queryFn: () => window.armin.decks.list(),
  });

  const decks = decksQuery.data ?? [];
  const sortedDecks = useMemo(() => sortDecks(decks, sort), [decks, sort]);

  const prefetchDeck = (deckId: string) => {
    if (prefetchedDecksRef.current.has(deckId)) return;
    prefetchedDecksRef.current.add(deckId);

    void queryClient.prefetchQuery({
      queryKey: deckKeys.detail(deckId),
      queryFn: () => window.armin.decks.get(deckId),
    });
    void queryClient.prefetchQuery({
      queryKey: flashcardKeys.deckTags(deckId),
      queryFn: () => window.armin.flashcards.listDeckTags(deckId),
    });
    void queryClient.prefetchInfiniteQuery({
      queryKey: flashcardKeys.browse({ deckId, sort: "due-soon" }),
      queryFn: ({ pageParam }) =>
        window.armin.flashcards.browse({
          offset: pageParam,
          limit: BROWSE_PAGE_SIZE,
          sort: "due-soon",
          deckId,
        }),
      initialPageParam: 0,
      getNextPageParam: (
        lastPage: BrowsePageResult,
        allPages: BrowsePageResult[],
      ) => {
        const loaded = allPages.reduce(
          (count, page) => count + page.flashcards.length,
          0,
        );
        return loaded < lastPage.filteredTotal ? loaded : undefined;
      },
    });
  };

  const createDeck = useMutation({
    mutationFn: (input: { name: string; description?: string | null }) =>
      window.armin.decks.create(input),
    onSuccess: (deck) => {
      void queryClient.invalidateQueries({ queryKey: deckKeys.all });
      toast({ tone: "success", title: "Deck created", description: deck.name });
      setClosingAfterCreate(true);
      setOpen(false);
    },
    onError: () => {
      toast({ tone: "error", title: "Couldn’t create deck" });
    },
  });

  const updateDeck = useMutation({
    mutationFn: (input: { id: string; name: string }) =>
      window.armin.decks.update(input),
    onSuccess: (deck) => {
      if (!deck) return;
      queryClient.setQueryData<UiDeck[]>(deckKeys.all, (current) =>
        current?.map((cached) =>
          cached.id === deck.id ? { ...cached, ...deck } : cached,
        ),
      );
      queryClient.setQueryData(deckKeys.detail(deck.id), (current: UiDeck) =>
        current ? { ...current, ...deck } : current,
      );
      invalidateDeckScopedData(queryClient, deck.id);
      toast({ tone: "success", title: "Deck renamed", description: deck.name });
      setClosingAfterRename(true);
      setRenameOpen(false);
    },
    onError: () => {
      toast({ tone: "error", title: "Couldn’t rename deck" });
    },
  });

  const deleteDeck = useMutation({
    mutationFn: (id: string) => window.armin.decks.delete(id),
    onSuccess: (_result, id) => {
      queryClient.setQueryData<UiDeck[]>(deckKeys.all, (current) =>
        current?.filter((deck) => deck.id !== id),
      );
      queryClient.removeQueries({ queryKey: deckKeys.detail(id) });
      invalidateDeckScopedData(queryClient, id);
      toast({ tone: "success", title: "Deck deleted" });
      setClosingAfterDelete(true);
      setDeleteOpen(false);
    },
    onError: () => {
      toast({ tone: "error", title: "Couldn’t delete deck" });
    },
  });

  const create = () => {
    if (!name.trim()) return;
    createDeck.mutate({
      name: name.trim(),
      description: description.trim() ? description.trim() : null,
    });
  };

  const handleImported = (summary: ImportSummary) => {
    void queryClient.invalidateQueries({ queryKey: deckKeys.all });
    const deckLabel =
      summary.deckCount && summary.deckCount > 1
        ? `${summary.deckCount} decks`
        : summary.name;
    toast({
      tone: "success",
      title: "Import complete",
      description: importToastDescription(summary, deckLabel),
    });
    setImportOpen(false);
  };

  const handleCreateDialogExit = () => {
    if (closingAfterCreate) {
      setName("");
      setDescription("");
      setClosingAfterCreate(false);
    }
  };

  const handleRenameDialogExit = () => {
    setRenamingDeck(null);
    setRenameName("");
    setClosingAfterRename(false);
  };

  const handleDeleteDialogExit = () => {
    setDeletingDeck(null);
    setClosingAfterDelete(false);
  };

  return (
    <div>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.75rem] font-semibold tracking-tight text-balance">
            Decks
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            {!decksQuery.isLoading
              ? `${decks.length} decks, building toward what's next.`
              : "Your study decks live here."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4" /> Import
          </Button>
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> New deck
          </Button>
        </div>
      </header>

      {decksQuery.isLoading && <DecksSkeleton />}

      {decksQuery.isError && (
        <div className="flex flex-col items-center border border-border bg-bg-2 px-6 py-14 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center bg-relearning-bg text-relearning">
            <AlertTriangle className="h-6 w-6" strokeWidth={1.5} />
          </div>
          <h3 className="text-base font-semibold text-ink">
            Couldn&apos;t load your decks
          </h3>
          <p className="mt-1 max-w-[40ch] text-sm text-muted">
            Something went wrong reading from local storage. Your data is safe
            on disk.
          </p>
          <Button
            variant="outline"
            className="mt-5"
            onClick={() => void decksQuery.refetch()}
          >
            Try again
          </Button>
        </div>
      )}

      {!decksQuery.isLoading && !decksQuery.isError && decks.length === 0 && (
        <EmptyState
          icon={Layers}
          title="No decks yet"
          description="A deck is a set of flashcards on one subject. Create your first one, then add flashcards and organize their prerequisites."
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> Create your first deck
            </Button>
          }
        />
      )}

      {!decksQuery.isLoading && !decksQuery.isError && decks.length > 0 && (
        <div className="mb-4 flex justify-end">
          <SortControl
            value={sort}
            onChange={setSort}
            options={DECK_SORT_OPTIONS}
          />
        </div>
      )}

      {!decksQuery.isLoading && !decksQuery.isError && decks.length > 0 && (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sortedDecks.map((deck) => (
            <li key={deck.id}>
              <DeckTile
                deck={deck}
                onPrefetch={() => prefetchDeck(deck.id)}
                onRename={() => {
                  setRenamingDeck(deck);
                  setRenameName(deck.name);
                  setRenameOpen(true);
                }}
                onDelete={() => {
                  setDeletingDeck(deck);
                  setDeleteOpen(true);
                }}
              />
            </li>
          ))}
        </ul>
      )}

      <ImportDeckDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={handleImported}
      />

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        onExitComplete={handleCreateDialogExit}
        title="New deck"
        description="Name it for the subject you're learning."
      >
        <div className="space-y-3">
          <Input
            placeholder="e.g. JavaScript Fundamentals"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") create();
            }}
          />
          <AutoGrowTextarea
            placeholder="What this deck covers (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            minHeight={100}
            maxHeight={240}
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!name.trim()}
              busy={createDeck.isPending || closingAfterCreate}
              onClick={create}
            >
              Create deck
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
        onExitComplete={handleRenameDialogExit}
        title="Rename deck"
        description="Choose a new name for this deck."
      >
        <div className="space-y-3">
          <Input
            placeholder="Deck name"
            value={renameName}
            autoFocus
            onChange={(e) => setRenameName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && renamingDeck && renameName.trim()) {
                updateDeck.mutate({
                  id: renamingDeck.id,
                  name: renameName.trim(),
                });
              }
            }}
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                !renameName.trim() ||
                renameName.trim() === renamingDeck?.name
              }
              busy={updateDeck.isPending || closingAfterRename}
              onClick={() => {
                if (!renamingDeck || !renameName.trim()) return;
                updateDeck.mutate({
                  id: renamingDeck.id,
                  name: renameName.trim(),
                });
              }}
            >
              Save
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onExitComplete={handleDeleteDialogExit}
        title="Delete deck?"
        description={
          deletingDeck
            ? `“${deletingDeck.name}” and all ${deletingDeck.total} flashcards in it will be permanently removed.`
            : undefined
        }
      >
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            busy={deleteDeck.isPending || closingAfterDelete}
            onClick={() => {
              if (!deletingDeck) return;
              deleteDeck.mutate(deletingDeck.id);
            }}
          >
            Delete deck
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function DeckActionItems({
  onRename,
  onDelete,
  Item,
  Separator,
}: {
  onRename: () => void;
  onDelete: () => void;
  Item: typeof DropdownMenuItem;
  Separator: typeof DropdownMenuSeparator;
}) {
  return (
    <>
      <Item onClick={onRename}>
        <Pencil className="h-4 w-4" />
        Rename deck
      </Item>
      <Separator />
      <Item variant="destructive" onClick={onDelete}>
        <Trash2 className="h-4 w-4" />
        Delete deck
      </Item>
    </>
  );
}

function DeckTile({
  deck,
  onPrefetch,
  onRename,
  onDelete,
}: {
  deck: UiDeck;
  onPrefetch: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const pct =
    deck.total > 0 ? Math.round((deck.learned / deck.total) * 100) : 0;

  return (
    <ContextMenu>
      <ContextMenuTrigger
        className="group relative flex h-full cursor-pointer flex-col border border-border bg-surface p-5 transition-colors duration-150 hover:border-border-strong hover:bg-surface-sunken"
        onPointerEnter={onPrefetch}
        onFocus={onPrefetch}
        onPointerDown={onPrefetch}
      >
        <Link
          to="/deck/$deckId"
          params={{ deckId: deck.id }}
          aria-label={`Open deck: ${deck.name}`}
          className="absolute inset-0 z-10 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        <div className="pointer-events-none relative z-20 flex flex-1 flex-col">
          <div className="flex items-start justify-between gap-2">
            <h2 className="min-w-0 flex-1 font-serif text-lg font-semibold text-ink">
              {deck.name}
            </h2>
            <div className="pointer-events-auto relative z-20 shrink-0">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Deck actions"
                      className="-mt-1.5 -mr-1.5"
                    />
                  }
                >
                  <Ellipsis className="h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-40">
                  <DeckActionItems
                    onRename={onRename}
                    onDelete={onDelete}
                    Item={DropdownMenuItem}
                    Separator={DropdownMenuSeparator}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <div className="mt-1 flex flex-1 flex-col">
            {deck.description && (
              <p className="line-clamp-2 text-sm text-muted">
                {deck.description}
              </p>
            )}
            <div className="mt-4 flex flex-1 flex-col justify-end">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>{deck.total} flashcards</span>
                <span>{pct}% learned</span>
              </div>
              <Progress
                value={deck.learned}
                max={deck.total}
                tone="good"
                className="mt-1.5"
              />
              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                {deck.due > 0 && (
                  <Stat color="bg-accent" label={`${deck.due} due`} emphatic />
                )}
                {deck.newCount > 0 && (
                  <Stat color="bg-new" label={`${deck.newCount} new`} />
                )}
                {deck.learning > 0 && (
                  <Stat
                    color="bg-learning"
                    label={`${deck.learning} learning`}
                  />
                )}
                {deck.due === 0 && deck.newCount === 0 && (
                  <span className="text-muted">All caught up</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="min-w-40">
        <DeckActionItems
          onRename={onRename}
          onDelete={onDelete}
          Item={ContextMenuItem}
          Separator={ContextMenuSeparator}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
}

function Stat({
  color,
  label,
  emphatic,
}: {
  color: string;
  label: string;
  emphatic?: boolean;
}) {
  return (
    <span
      className={
        emphatic
          ? "inline-flex items-center gap-1.5 font-medium text-ink"
          : "inline-flex items-center gap-1.5 text-muted"
      }
    >
      <span className={`h-1.5 w-1.5 ${color}`} aria-hidden />
      {label}
    </span>
  );
}

function DecksSkeleton() {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <li key={i} className="border border-border bg-surface p-5">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="mt-2 h-3.5 w-full" />
          <Skeleton className="mt-4 h-1.5 w-full" />
          <Skeleton className="mt-2.5 h-3 w-24" />
        </li>
      ))}
    </ul>
  );
}
