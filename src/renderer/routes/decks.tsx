import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Layers, Plus, AlertTriangle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ImportDeckDialog,
  type ImportSummary,
} from "@/components/import-deck-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { SortControl } from "@/components/sort-control";
import { useToast } from "@/components/ui/toast";
import {
  DECK_SORT_OPTIONS,
  sortDecks,
  type DeckSortKey,
} from "@/lib/sort-decks";
import { usePreview } from "@/preview/preview-context";
import { decks, type UiDeck } from "@/data/fixtures";

export default function DecksPage() {
  // UI PREVIEW ONLY: `scenario` stands in for a query's status. Replace this
  // and the fixture read with useQuery(["decks"], window.armin.decks.list).
  const { scenario, setScenario } = usePreview();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sort, setSort] = useState<DeckSortKey>("name-asc");

  const sortedDecks = useMemo(() => sortDecks(decks, sort), [sort]);

  const create = () => {
    if (!name.trim()) return;
    toast({ tone: "success", title: "Deck created", description: name.trim() });
    setOpen(false);
    setName("");
    setDescription("");
  };

  const handleImport = (summary: ImportSummary) => {
    toast({
      tone: "success",
      title: "Deck imported",
      description: `${summary.name} · ${summary.cardCount} cards from ${summary.source}`,
    });
    setImportOpen(false);
  };

  return (
    <div>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.75rem] font-semibold tracking-tight text-balance">
            Decks
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            {scenario === "ready"
              ? `${decks.length} decks, building toward what's next.`
              : "Your study decks live here."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Download className="h-4 w-4" /> Import deck
          </Button>
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> New deck
          </Button>
        </div>
      </header>

      {scenario === "loading" && <DecksSkeleton />}

      {scenario === "error" && (
        <div className="flex flex-col items-center border border-border px-6 py-14 text-center">
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
            onClick={() => setScenario("ready")}
          >
            Try again
          </Button>
        </div>
      )}

      {scenario === "empty" && (
        <EmptyState
          icon={Layers}
          title="No decks yet"
          description="A deck is a set of cards on one subject. Create your first one, then add cards or generate them with your AI agent."
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> Create your first deck
            </Button>
          }
        />
      )}

      {scenario === "ready" && decks.length > 0 && (
        <div className="mb-4 flex justify-end">
          <SortControl value={sort} onChange={setSort} options={DECK_SORT_OPTIONS} />
        </div>
      )}

      {scenario === "ready" && (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sortedDecks.map((deck, i) => (
            <li
              key={deck.id}
              className="animate-rise"
              style={{ animationDelay: `${i * 35}ms` }}
            >
              <DeckTile deck={deck} />
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
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
          <Textarea
            placeholder="What this deck covers (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!name.trim()} onClick={create}>
              Create deck
            </Button>
          </div>
        </div>
      </Dialog>

      <ImportDeckDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={handleImport}
      />
    </div>
  );
}

function DeckTile({ deck }: { deck: UiDeck }) {
  const pct = deck.total > 0 ? Math.round((deck.learned / deck.total) * 100) : 0;

  return (
    <Link
      to="/deck/$deckId"
      params={{ deckId: deck.id }}
      className="flex h-full flex-col border border-border p-5 transition-colors duration-150 hover:border-border-strong hover:bg-bg-2/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <h2 className="font-serif text-lg font-semibold text-ink">{deck.name}</h2>
      {deck.description && (
        <p className="mt-1 line-clamp-2 text-sm text-muted">{deck.description}</p>
      )}
      <div className="mt-4 flex flex-1 flex-col justify-end">
        <div className="flex items-center justify-between text-xs text-muted">
          <span>{deck.total} cards</span>
          <span>{pct}% learned</span>
        </div>
        <Progress value={deck.learned} max={deck.total} tone="good" className="mt-1.5" />
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {deck.due > 0 && (
            <Stat color="bg-accent" label={`${deck.due} due`} emphatic />
          )}
          {deck.newCount > 0 && (
            <Stat color="bg-new" label={`${deck.newCount} new`} />
          )}
          {deck.learning > 0 && (
            <Stat color="bg-learning" label={`${deck.learning} learning`} />
          )}
          {deck.due === 0 && deck.newCount === 0 && (
            <span className="text-muted">All caught up</span>
          )}
        </div>
      </div>
    </Link>
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
        <li key={i} className="border border-border p-5">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="mt-2 h-3.5 w-full" />
          <Skeleton className="mt-4 h-1.5 w-full" />
          <Skeleton className="mt-2.5 h-3 w-24" />
        </li>
      ))}
    </ul>
  );
}
