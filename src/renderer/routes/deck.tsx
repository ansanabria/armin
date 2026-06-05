import { useState, type ReactNode } from "react";
import { Link, useParams } from "@tanstack/react-router";
import {
  ArrowLeft,
  Plus,
  Play,
  Trash2,
  Pencil,
  Layers,
  AlertTriangle,
  Share2,
  MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Dialog } from "@/components/ui/dialog";
import { StateBadge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { usePreview } from "@/preview/preview-context";
import {
  getDeck,
  getDeckCards,
  type UiCard,
} from "@/data/fixtures";
import { cn } from "@/lib/utils";

export default function DeckPage() {
  const { deckId } = useParams({ from: "/deck/$deckId" });
  const deck = getDeck(deckId);
  const cards = getDeckCards(deckId);

  // UI PREVIEW ONLY: replace `scenario` + fixture reads with real queries.
  const { scenario, setScenario } = usePreview();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UiCard | null>(null);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");

  const openNew = () => {
    setEditing(null);
    setFront("");
    setBack("");
    setOpen(true);
  };
  const openEdit = (card: UiCard) => {
    setEditing(card);
    setFront(card.front);
    setBack(card.back);
    setOpen(true);
  };
  const save = () => {
    if (!front.trim() || !back.trim()) return;
    toast({
      tone: "success",
      title: editing ? "Card updated" : "Card added",
    });
    setOpen(false);
  };

  const dueCount = cards.filter((c) => c.dueLabel === "Due now").length;

  if (!deck) {
    return (
      <div>
        <Link
          to="/"
          className="inline-flex items-center gap-1 rounded-sm text-sm text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petrol"
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
        className="inline-flex items-center gap-1 rounded-sm text-sm text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petrol"
      >
        <ArrowLeft className="h-4 w-4" /> All decks
      </Link>

      <header className="mb-6 mt-4 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-balance">
            {deck.name}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {deck.total} cards
            <span className="text-border-strong"> · </span>
            {deck.learned} learned
            {dueCount > 0 && (
              <>
                <span className="text-border-strong"> · </span>
                <span className="font-medium text-clay">{dueCount} due now</span>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() =>
              toast({
                title: "Prerequisite graph",
                description: "Coming soon — the visual canvas is next.",
              })
            }
          >
            <Share2 className="h-4 w-4" /> Graph
          </Button>
          {dueCount > 0 && (
            <Link to="/deck/$deckId/review" params={{ deckId: deck.id }}>
              <Button variant="outline">
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
        <div className="flex flex-col items-center rounded-xl border border-border bg-surface px-6 py-14 text-center">
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
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <li
              key={card.id}
              className={cn(
                "group flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 transition-colors duration-150 hover:border-border-strong",
                card.locked && "opacity-65",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <StateBadge
                  state={card.state}
                  locked={card.locked}
                  className="shrink-0"
                />
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Card actions"
                        className="-mr-1 -mt-1 shrink-0"
                      />
                    }
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-40">
                    <DropdownMenuItem onClick={() => openEdit(card)}>
                      <Pencil className="h-4 w-4" />
                      Edit card
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() =>
                        toast({ tone: "error", title: "Card deleted" })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete card
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <span
                className={cn(
                  "font-mono text-xs",
                  card.dueLabel === "Due now" ? "text-clay" : "text-muted",
                )}
              >
                {card.dueLabel}
              </span>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-medium text-ink">
                  {card.front}
                </p>
                <p className="mt-1 line-clamp-2 text-[0.8125rem] text-muted">
                  {card.back}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit card" : "Add card"}
      >
        <div className="space-y-4">
          <Field label="Front" hint="The prompt or question.">
            <Textarea
              autoFocus
              value={front}
              onChange={(e) => setFront(e.target.value)}
              placeholder="What does `typeof null` return?"
            />
          </Field>
          <Field label="Back" hint="The answer to recall.">
            <Textarea
              value={back}
              onChange={(e) => setBack(e.target.value)}
              placeholder={'`"object"` — a historical bug kept for compatibility.'}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!front.trim() || !back.trim()} onClick={save}>
              {editing ? "Save changes" : "Add card"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline gap-2">
        <span className="text-sm font-medium text-ink">{label}</span>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function CardsSkeleton() {
  return (
    <ul className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <li
          key={i}
          className="flex items-center gap-4 rounded-lg border border-border bg-surface p-4"
        >
          <Skeleton className="h-5 w-20 rounded-sm" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="mt-1.5 h-3 w-3/4" />
          </div>
          <Skeleton className="h-3 w-12" />
        </li>
      ))}
    </ul>
  );
}
