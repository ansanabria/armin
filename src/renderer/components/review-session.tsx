import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  CheckCircle2,
  AlertTriangle,
  Check,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Undo2,
  EllipsisVertical,
  Pencil,
  Archive,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ImageOcclusionReview } from "@/components/image-occlusion-review";
import {
  FlashcardFormDialog,
  type CardFormValues,
} from "@/components/flashcard-form-dialog";
import { reviewKeys } from "@/lib/armin-query";
import type { FlashcardDeleteConsequences, Grade, PreviewOption } from "@/types/window";
import type { UiFlashcard, UiReviewUnit } from "@/types/view-models";
import {
  matchesTypeAnswer,
  type ImageOcclusionContent,
  type TypeAnswerContent,
} from "../../main/services/flashcard-types";
import { cn } from "@/lib/utils";

const RATINGS: {
  grade: Grade;
  label: string;
  bg: string;
}[] = [
  { grade: 1, label: "Again", bg: "bg-again hover:bg-again-deep" },
  { grade: 2, label: "Hard", bg: "bg-hard hover:bg-hard-deep" },
  { grade: 3, label: "Good", bg: "bg-good hover:bg-good-deep" },
  { grade: 4, label: "Easy", bg: "bg-easy hover:bg-easy-deep" },
];

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

function reconcileSessionCards(
  current: UiReviewUnit[],
  incoming: UiReviewUnit[],
): UiReviewUnit[] {
  const incomingById = new Map(incoming.map((c) => [c.id, c]));
  const currentIds = new Set(current.map((c) => c.id));
  const updated = current.map((c) => incomingById.get(c.id) ?? c);
  const appended = incoming.filter((c) => !currentIds.has(c.id));
  return [...updated, ...appended];
}

export type ReviewSessionProps = {
  /** Cards due for this session. Tag cards with `deck` to show the source. */
  queue: UiReviewUnit[];
  /** Top-of-page content — a back link or a page title. */
  header: ReactNode;
  /** Secondary line under the header (e.g. due count). Session progress aligns right. */
  subtitle?: ReactNode;
  /** Deck selector rendered in the header row (top right). */
  deckSelector?: ReactNode;
  /** Action shown in the empty/done panel (typically a back button). */
  doneAction: ReactNode;
  /** Copy for the "all caught up" panel after clearing the queue. */
  doneDescription: string;
  /** Copy for the "all caught up" panel when nothing was due. */
  emptyDescription: string;
  /** Changing this resets the session to the first card. */
  resetKey?: string;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  loadPreview: (reviewUnitId: string) => Promise<PreviewOption[]>;
  onRate: (reviewUnitId: string, rating: Grade) => Promise<void>;
  onUndo?: (reviewUnitId: string) => Promise<void>;
  loadCard?: (flashcardId: string) => Promise<UiFlashcard | undefined>;
  onEditFlashcard?: (
    flashcardId: string,
    values: CardFormValues,
  ) => Promise<void>;
  onArchiveFlashcard?: (flashcardId: string) => Promise<void>;
  onDeleteFlashcard?: (flashcardId: string) => Promise<void>;
  loadDeleteConsequences?: (
    flashcardId: string,
  ) => Promise<FlashcardDeleteConsequences>;
};

export function ReviewSession({
  queue,
  header,
  subtitle,
  deckSelector,
  doneAction,
  doneDescription,
  emptyDescription,
  resetKey,
  isLoading = false,
  isError = false,
  onRetry,
  loadPreview,
  onRate,
  onUndo,
  loadCard,
  onEditFlashcard,
  onArchiveFlashcard,
  onDeleteFlashcard,
  loadDeleteConsequences,
}: ReviewSessionProps) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [rating, setRating] = useState<Grade | null>(null);
  const [typed, setTyped] = useState("");
  const [sessionCards, setSessionCards] = useState<UiReviewUnit[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [undoing, setUndoing] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editCard, setEditCard] = useState<UiFlashcard | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConsequences, setDeleteConsequences] =
    useState<FlashcardDeleteConsequences | null>(null);
  const [deleteConsequencesError, setDeleteConsequencesError] = useState(false);
  const [flashcardActionPending, setCardActionPending] = useState(false);

  const cards = isLoading || isError ? [] : sessionCards;
  const card = cards[index];
  const done =
    !isLoading && !isError && index >= cards.length && cards.length > 0;
  const empty = !isLoading && !isError && cards.length === 0;

  const isTypeAnswer = card?.type === "type_answer";
  const typeAnswerContent =
    card?.type === "type_answer" ? (card.content as TypeAnswerContent) : null;
  const imageOcclusionContent =
    card?.type === "image_occlusion"
      ? (card.content as ImageOcclusionContent)
      : null;
  const isCorrect = typeAnswerContent
    ? matchesTypeAnswer(typed, typeAnswerContent)
    : false;

  const preview = useQuery({
    queryKey: card
      ? reviewKeys.preview(card.id)
      : ["review", "preview", "none"],
    queryFn: () => loadPreview(card!.id),
    enabled: Boolean(card),
  });

  const intervalLabels = new Map<Grade, string>(
    (preview.data ?? []).map((option) => [
      option.rating as Grade,
      option.label,
    ]),
  );

  const reveal = () => {
    if (!card) return;
    setFlipped(true);
  };

  const removeFromSession = useCallback((reviewUnitId: string) => {
    setSessionCards((prev) => {
      const removeIdx = prev.findIndex((c) => c.id === reviewUnitId);
      const next = prev.filter((c) => c.id !== reviewUnitId);
      setIndex((i) => {
        if (removeIdx < 0) return i;
        if (i > removeIdx) return i - 1;
        return Math.min(i, Math.max(0, next.length - 1));
      });
      return next;
    });
    setHistory((h) => h.filter((id) => id !== reviewUnitId));
  }, []);

  const rate = async (grade: Grade) => {
    if (!card || rating) return;
    setRating(grade);
    try {
      await onRate(card.id, grade);
      setHistory((h) => [...h, card.id]);
      setFlipped(false);
      setTyped("");
      setIndex((i) => i + 1);
    } catch {
      // The route-level mutation handler owns the user-visible error toast.
    } finally {
      setRating(null);
    }
  };

  const goPrev = () => {
    if (index > 0) setIndex((i) => i - 1);
  };

  const goNext = () => {
    if (index < cards.length - 1) setIndex((i) => i + 1);
  };

  const undoLast = async () => {
    if (!onUndo || history.length === 0 || undoing) return;
    const lastId = history[history.length - 1]!;
    setUndoing(true);
    try {
      await onUndo(lastId);
      setHistory((h) => h.slice(0, -1));
      const idx = sessionCards.findIndex((c) => c.id === lastId);
      if (idx >= 0) setIndex(idx);
      setFlipped(false);
      setTyped("");
    } finally {
      setUndoing(false);
    }
  };

  const openEdit = async () => {
    if (!card || !loadCard) return;
    const loaded = await loadCard(card.flashcardId);
    if (loaded) {
      setEditCard(loaded);
      setEditOpen(true);
    }
  };

  const handleEditSubmit = async (values: CardFormValues) => {
    if (!editCard || !onEditFlashcard) return;
    await onEditFlashcard(editCard.id, values);
    setEditOpen(false);
  };

  const handleArchive = async () => {
    if (!card || !onArchiveFlashcard || flashcardActionPending) return;
    setCardActionPending(true);
    try {
      await onArchiveFlashcard(card.flashcardId);
      setDeleteConfirmOpen(false);
      removeFromSession(card.id);
    } finally {
      setCardActionPending(false);
    }
  };

  const openDeleteConfirm = () => {
    if (!card) return;
    setDeleteConsequences(null);
    setDeleteConsequencesError(false);
    setDeleteConfirmOpen(true);
    if (loadDeleteConsequences) {
      void loadDeleteConsequences(card.flashcardId)
        .then((summary) => setDeleteConsequences(summary))
        .catch(() => setDeleteConsequencesError(true));
    }
  };

  const handleDelete = async () => {
    if (!card || !onDeleteFlashcard || flashcardActionPending) return;
    setCardActionPending(true);
    try {
      await onDeleteFlashcard(card.flashcardId);
      setDeleteConfirmOpen(false);
      removeFromSession(card.id);
    } finally {
      setCardActionPending(false);
    }
  };

  const hasCardActions = Boolean(
    onEditFlashcard || onArchiveFlashcard || onDeleteFlashcard,
  );

  useEffect(() => {
    setIndex(0);
    setFlipped(false);
    setTyped("");
    setSessionCards([]);
    setHistory([]);
  }, [resetKey]);

  useEffect(() => {
    if (isLoading || isError) return;
    setSessionCards((prev) => {
      if (prev.length === 0) return queue;
      return reconcileSessionCards(prev, queue);
    });
  }, [isLoading, isError, queue]);

  useEffect(() => {
    setFlipped(false);
    setTyped("");
  }, [card?.id]);

  useEffect(() => {
    if (isLoading || isError || !card) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inField =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
      if (!flipped) {
        if (e.key === "Enter") {
          e.preventDefault();
          reveal();
        } else if (e.key === " " && !inField) {
          e.preventDefault();
          reveal();
        } else if (e.key === "ArrowLeft" && !inField) {
          e.preventDefault();
          goPrev();
        } else if (e.key === "ArrowRight" && !inField) {
          e.preventDefault();
          goNext();
        }
      } else if (["1", "2", "3", "4"].includes(e.key) && !inField) {
        void rate(Number(e.key) as Grade);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isLoading, isError, card, flipped, rating, index, cards.length]);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1 [&_h1]:m-0">{header}</div>
        {deckSelector && <div className="shrink-0">{deckSelector}</div>}
      </div>

      {(subtitle || card) && (
        <div
          className={cn(
            "mt-1.5 flex items-baseline gap-4 text-sm",
            subtitle && "justify-between",
          )}
        >
          {subtitle && <p className="min-w-0 text-muted">{subtitle}</p>}
          {card && (
            <div
              className={cn(
                "flex shrink-0 items-center gap-3 font-mono text-xs uppercase tracking-wide text-muted",
                !subtitle && "ml-auto",
              )}
            >
              {card.deck && card.deckId && (
                <Link
                  to="/deck/$deckId"
                  params={{ deckId: card.deckId }}
                  className="rounded-sm transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {card.deck}
                </Link>
              )}
              <span>
                {index + 1} / {cards.length}
              </span>
            </div>
          )}
        </div>
      )}

      {isLoading && (
        <div className="mt-6">
          <Skeleton className="h-1.5 w-full rounded-full" />
          <Skeleton className="mt-6 h-[260px] w-full rounded-xl" />
          <Skeleton className="mt-6 h-11 w-full" />
        </div>
      )}

      {isError && (
        <div className="mt-10 flex flex-col items-center border border-border bg-bg-2 px-6 py-14 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-relearning-bg text-relearning">
            <AlertTriangle className="h-6 w-6" strokeWidth={1.5} />
          </div>
          <h2 className="text-xl font-semibold">Review couldn&apos;t start</h2>
          <p className="mt-1 max-w-[40ch] text-sm text-muted">
            The scheduler hit a snag building your queue.
          </p>
          <Button variant="outline" className="mt-5" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}

      {(empty || done) && (
        <div className="mt-16 flex flex-col items-center border border-border bg-bg-2 px-6 py-14 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-review-bg text-good">
            <CheckCircle2 className="h-7 w-7" strokeWidth={1.5} />
          </div>
          <h2 className="text-xl font-semibold tracking-tight">
            All caught up
          </h2>
          <p className="mt-1.5 max-w-[44ch] text-pretty text-sm text-muted">
            {done ? doneDescription : emptyDescription}
          </p>
          <div className="mt-6">{doneAction}</div>
        </div>
      )}

      {card && (
        <div className="mt-8">
          <div className="mb-8 flex items-center gap-3">
            <Progress value={index} max={cards.length} className="flex-1" />
            {onUndo && (
              <Button
                variant="outline"
                size="sm"
                disabled={history.length === 0 || undoing}
                onClick={() => void undoLast()}
                aria-label="Undo last review"
              >
                <Undo2 className="h-4 w-4" />
                Undo
              </Button>
            )}
          </div>

          <div className="relative flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-border-strong bg-paper px-10 py-12 text-center">
            {hasCardActions && (
              <div className="absolute top-3 right-3">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Flashcard actions"
                      />
                    }
                  >
                    <EllipsisVertical className="h-4 w-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-40">
                    {onEditFlashcard && loadCard && (
                      <DropdownMenuItem onClick={() => void openEdit()}>
                        <Pencil className="h-4 w-4" />
                        Edit flashcard
                      </DropdownMenuItem>
                    )}
                    {onArchiveFlashcard && (
                      <DropdownMenuItem
                        disabled={flashcardActionPending}
                        onClick={() => void handleArchive()}
                      >
                        <Archive className="h-4 w-4" />
                        Archive
                      </DropdownMenuItem>
                    )}
                    {onDeleteFlashcard && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          disabled={flashcardActionPending}
                          onClick={openDeleteConfirm}
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}

            {imageOcclusionContent ? (
              <ImageOcclusionReview
                content={imageOcclusionContent}
                targetId={card.subKey}
                flipped={flipped}
              />
            ) : (
              <>
                <MarkdownContent
                  content={card.front}
                  className="max-w-[52ch] text-pretty text-xl font-medium leading-snug text-balance"
                />

                {isTypeAnswer && (
                  <div className="mt-6 w-full max-w-sm">
                    <Input
                      autoFocus
                      value={typed}
                      disabled={flipped}
                      onChange={(e) => setTyped(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !flipped) {
                          e.preventDefault();
                          reveal();
                        }
                      }}
                      placeholder="Type your answer…"
                      aria-label="Your answer"
                      className="text-center"
                    />
                  </div>
                )}

                {flipped && (
                  <div className="animate-flip-in flex w-full flex-col items-center">
                    <div className="my-7 h-px w-16 bg-border-strong" />
                    {isTypeAnswer && (
                      <div
                        className={cn(
                          "mb-3 inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-sm font-medium",
                          isCorrect
                            ? "bg-review-bg text-good"
                            : "bg-relearning-bg text-relearning",
                        )}
                      >
                        {isCorrect ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <XCircle className="h-4 w-4" />
                        )}
                        {isCorrect ? "Correct" : "Not quite"}
                      </div>
                    )}
                    <MarkdownContent
                      content={card.back}
                      className="max-w-[52ch] text-pretty text-lg leading-relaxed text-ink/90"
                    />
                  </div>
                )}
              </>
            )}
          </div>

          <div className="mt-6 flex items-stretch gap-2">
            <Button
              variant="outline"
              size="lg"
              className="shrink-0 px-3"
              disabled={index === 0}
              onClick={goPrev}
              aria-label="Previous review unit"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>

            <div className="min-w-0 flex-1">
              {!flipped ? (
                <Button size="lg" className="w-full" onClick={reveal}>
                  {isTypeAnswer ? "Check answer" : "Show answer"}
                  <Kbd className="ml-1 border-on-accent/25 bg-on-accent/10 text-on-accent shadow-none">
                    {isTypeAnswer ? "Enter" : "Space"}
                  </Kbd>
                </Button>
              ) : (
                <div className="grid h-full grid-cols-2 gap-2 sm:grid-cols-4">
                  {RATINGS.map((r) => (
                    <button
                      key={r.grade}
                      onClick={() => void rate(r.grade)}
                      disabled={rating !== null}
                      className={cn(
                        "flex flex-col items-center justify-center gap-0.5 rounded-md px-3 py-2.5 text-sm font-medium text-on-accent transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
                        r.bg,
                        isTypeAnswer &&
                          ((isCorrect && r.grade === 3) ||
                            (!isCorrect && r.grade === 1))
                          ? "ring-2 ring-ink ring-offset-2 ring-offset-bg"
                          : undefined,
                      )}
                    >
                      <span className="flex items-center gap-1.5">
                        {r.label}
                        <Kbd className="border-on-accent/25 bg-on-accent/10 text-on-accent shadow-none">
                          {r.grade}
                        </Kbd>
                      </span>
                      <span className="font-mono text-xs text-on-accent/85">
                        {intervalLabels.get(r.grade) ?? "…"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Button
              variant="outline"
              size="lg"
              className="shrink-0 px-3"
              disabled={index >= cards.length - 1}
              onClick={goNext}
              aria-label="Next review unit"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </div>
      )}

      {editCard && onEditFlashcard && (
        <FlashcardFormDialog
          open={editOpen}
          onClose={() => setEditOpen(false)}
          onExitComplete={() => setEditCard(null)}
          mode="edit"
          reviewUnitId={editCard.id}
          initialType={editCard.type}
          initialContent={editCard.content}
          initialTags={editCard.tags}
          onSubmit={handleEditSubmit}
        />
      )}

      <Dialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title="Delete flashcard?"
        description="This flashcard will be permanently hard-deleted."
      >
        <div className="space-y-3 text-sm text-muted">
          <p>
            Archive is the reversible way to set this aside. Delete removes the
            flashcard, its review units, and its review history permanently.
          </p>
          <ul className="space-y-1 rounded-md border border-border bg-surface-sunken p-3">
            <li>
              {deleteConsequencesError || !loadDeleteConsequences
                ? "Dependent count could not be loaded."
                : deleteConsequences
                  ? `${plural(deleteConsequences.dependentCount, "dependent")} will be unlocked or recomputed.`
                  : "Loading dependent count…"}
            </li>
            <li>
              {deleteConsequencesError || !loadDeleteConsequences
                ? "Review history could not be loaded."
                : formatReviewHistory(deleteConsequences)}
            </li>
          </ul>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={() => setDeleteConfirmOpen(false)}>
            Cancel
          </Button>
          {onArchiveFlashcard && card && (
            <Button
              disabled={flashcardActionPending}
              onClick={() => void handleArchive()}
            >
              Archive instead
            </Button>
          )}
          <Button
            variant="destructive"
            disabled={
              flashcardActionPending ||
              Boolean(loadDeleteConsequences && !deleteConsequences)
            }
            onClick={() => void handleDelete()}
          >
            Delete flashcard
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
