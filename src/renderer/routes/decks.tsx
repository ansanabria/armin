import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Layers, Plus, Play, AlertTriangle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { usePreview } from "@/preview/preview-context";
import {
  decks,
  firstDeckWithDue,
  totalDueToday,
  type UiDeck,
} from "@/data/fixtures";

export default function DecksPage() {
  // UI PREVIEW ONLY: `scenario` stands in for a query's status. Replace this
  // and the fixture read with useQuery(["decks"], window.armin.decks.list).
  const { scenario, setScenario } = usePreview();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const create = () => {
    if (!name.trim()) return;
    toast({ tone: "success", title: "Deck created", description: name.trim() });
    setOpen(false);
    setName("");
    setDescription("");
  };

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-balance">
            Decks
          </h1>
          <p className="mt-1 text-sm text-muted">
            {scenario === "ready"
              ? `${decks.length} decks, building toward what's next.`
              : "Your study decks live here."}
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> New deck
        </Button>
      </header>

      {scenario === "ready" && totalDueToday > 0 && <DueTodayBar />}

      {scenario === "loading" && <DecksSkeleton />}

      {scenario === "error" && (
        <div className="flex flex-col items-center rounded-xl border border-border bg-surface px-6 py-14 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-relearning-bg text-relearning">
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

      {scenario === "ready" && (
        <ul className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
          {decks.map((deck, i) => (
            <li
              key={deck.id}
              className="animate-rise"
              style={{ animationDelay: `${i * 45}ms` }}
            >
              <DeckCard deck={deck} />
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
    </div>
  );
}

function DueTodayBar() {
  const target = firstDeckWithDue();
  if (!target) return null;

  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-border bg-surface px-5 py-4">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-clay-tint text-clay-deep">
        <Play className="h-4 w-4 translate-x-px" fill="currentColor" />
      </span>
      <div className="mr-auto">
        <p className="text-sm font-medium text-ink">
          {totalDueToday} cards due today
        </p>
        <p className="text-[0.8125rem] text-muted">
          A short session keeps everything scheduled on track.
        </p>
      </div>
      <Link to="/deck/$deckId/review" params={{ deckId: target.id }}>
        <Button>
          Start review <ArrowRight className="h-4 w-4" />
        </Button>
      </Link>
    </div>
  );
}

function DeckCard({ deck }: { deck: UiDeck }) {
  const pct = deck.total > 0 ? Math.round((deck.learned / deck.total) * 100) : 0;
  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-surface p-5 transition-colors duration-150 hover:border-border-strong">
      <Link
        to="/deck/$deckId"
        params={{ deckId: deck.id }}
        className="rounded-sm font-semibold text-ink decoration-border-strong underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petrol"
      >
        {deck.name}
      </Link>
      {deck.description && (
        <p className="mt-1 line-clamp-2 text-sm text-muted">
          {deck.description}
        </p>
      )}

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
          <span>{deck.total} cards</span>
          <span>{pct}% learned</span>
        </div>
        <Progress value={deck.learned} max={deck.total} tone="good" />
      </div>

      <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {deck.due > 0 && (
          <Stat color="bg-clay" label={`${deck.due} due`} emphatic />
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

      <div className="mt-5 flex gap-2">
        {deck.due > 0 ? (
          <Link
            to="/deck/$deckId/review"
            params={{ deckId: deck.id }}
            className="flex-1"
          >
            <Button size="sm" className="w-full">
              <Play className="h-3.5 w-3.5" />
              Review
            </Button>
          </Link>
        ) : (
          <Button size="sm" className="flex-1" disabled>
            <Play className="h-3.5 w-3.5" />
            Nothing due
          </Button>
        )}
        <Link to="/deck/$deckId" params={{ deckId: deck.id }}>
          <Button size="sm" variant="outline">
            Open
          </Button>
        </Link>
      </div>
    </div>
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
        emphatic ? "inline-flex items-center gap-1.5 font-medium text-ink" : "inline-flex items-center gap-1.5 text-muted"
      }
    >
      <span className={`h-1.5 w-1.5 rounded-full ${color}`} aria-hidden />
      {label}
    </span>
  );
}

function DecksSkeleton() {
  return (
    <ul className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
      {Array.from({ length: 6 }).map((_, i) => (
        <li
          key={i}
          className="flex h-full flex-col rounded-lg border border-border bg-surface p-5"
        >
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="mt-2 h-3.5 w-full" />
          <Skeleton className="mt-1.5 h-3.5 w-4/5" />
          <Skeleton className="mt-5 h-1.5 w-full rounded-full" />
          <div className="mt-5 flex gap-2">
            <Skeleton className="h-8 flex-1" />
            <Skeleton className="h-8 w-16" />
          </div>
        </li>
      ))}
    </ul>
  );
}
