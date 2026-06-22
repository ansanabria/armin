import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, AlertTriangle, Check, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ImageOcclusionReview } from "@/components/image-occlusion-review";
import type { UiReviewUnit } from "@/types/view-models";
import {
  answerHead,
  activeUnitIds,
  buildDrillIndex,
  isDrillDone,
  type CramFlashcardGroup,
  type CramMode,
  type DrillState,
} from "@/lib/cram-drill";
import {
  matchesTypeAnswer,
  type ImageOcclusionContent,
  type TypeAnswerContent,
} from "../../main/services/flashcard-types";
import { cn } from "@/lib/utils";

export type { CramMode, CramFlashcardGroup };

export type CramSessionProps = {
  /** Every in-scope review unit, hydrated for display. */
  units: UiReviewUnit[];
  /** Per-flashcard grouping; a flashcard clears when all its units are cleared. */
  groups: CramFlashcardGroup[];
  /** Prerequisite edges internal to the scope (graph-follow only). */
  edges: { prereqId: string; dependentId: string }[];
  mode: CramMode;
  header: ReactNode;
  subtitle?: ReactNode;
  /** Action in the empty/done panel (e.g. change scope / back). */
  doneAction: ReactNode;
  /** Changing this restarts the drill from scratch. */
  resetKey?: string;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
};

function shuffle<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j]!, next[i]!];
  }
  return next;
}

export function CramSession({
  units,
  groups,
  edges,
  mode,
  header,
  subtitle,
  doneAction,
  resetKey,
  isLoading = false,
  isError = false,
  onRetry,
}: CramSessionProps) {
  const unitById = useMemo(
    () => new Map(units.map((unit) => [unit.id, unit])),
    [units],
  );
  const index = useMemo(
    () => buildDrillIndex(units, groups, edges, mode),
    [units, groups, edges, mode],
  );

  const [state, setState] = useState<DrillState>(() => ({
    cleared: new Set(),
    queue: [],
  }));
  const [flipped, setFlipped] = useState(false);
  const [typed, setTyped] = useState("");

  // Seed (and reset) the drill: clear progress, surface the initially-available
  // units in a shuffled order.
  useEffect(() => {
    if (isLoading || isError) return;
    const start = new Set<string>();
    setState({ cleared: start, queue: shuffle(activeUnitIds(index, start)) });
    setFlipped(false);
    setTyped("");
  }, [resetKey, isLoading, isError, index]);

  const { cleared, queue } = state;
  const currentId = queue[0];
  const card = currentId ? unitById.get(currentId) : undefined;

  useEffect(() => {
    setFlipped(false);
    setTyped("");
  }, [currentId]);

  const total = units.length;
  const clearedCount = cleared.size;
  const done = !isLoading && !isError && isDrillDone(index, state);
  const empty = !isLoading && !isError && total === 0;

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

  const reveal = () => {
    if (card) setFlipped(true);
  };

  const answer = useCallback(
    (correct: boolean) => {
      setState((prev) => answerHead(index, prev, correct));
      setFlipped(false);
      setTyped("");
    },
    [index],
  );

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
        }
        return;
      }
      if (e.key === "1" && !inField) {
        e.preventDefault();
        answer(false);
      } else if (
        (e.key === "2" || e.key === " " || e.key === "Enter") &&
        !inField
      ) {
        e.preventDefault();
        answer(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isLoading, isError, card, flipped, answer]);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1 [&_h1]:m-0">{header}</div>
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
              {card.deck && <span>{card.deck}</span>}
              <span>
                {clearedCount} / {total} cleared
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
          <h2 className="text-xl font-semibold">Cram couldn&apos;t start</h2>
          <p className="mt-1 max-w-[40ch] text-sm text-muted">
            We couldn&apos;t build a cram pool for this scope.
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
            {done ? "Pool cleared" : "Nothing to cram"}
          </h2>
          <p className="mt-1.5 max-w-[44ch] text-pretty text-sm text-muted">
            {done
              ? "You drilled every card in this scope. Nothing here touched your real schedule."
              : "No cards match this scope yet. Adjust the decks or tags and try again."}
          </p>
          <div className="mt-6">{doneAction}</div>
        </div>
      )}

      {card && (
        <div className="mt-8">
          <div className="mb-8 flex items-center gap-3">
            <Progress value={clearedCount} max={total} className="flex-1" />
          </div>

          <div className="relative flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-border-strong bg-paper px-10 py-12 text-center">
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

          <div className="mt-6">
            {!flipped ? (
              <Button size="lg" className="w-full" onClick={reveal}>
                {isTypeAnswer ? "Check answer" : "Show answer"}
                <Kbd className="ml-1 border-on-accent/25 bg-on-accent/10 text-on-accent shadow-none">
                  {isTypeAnswer ? "Enter" : "Space"}
                </Kbd>
              </Button>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => answer(false)}
                  className="flex items-center justify-center gap-1.5 rounded-md bg-again px-3 py-2.5 text-sm font-medium text-on-accent transition-colors duration-150 hover:bg-again-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                >
                  Again
                  <Kbd className="border-on-accent/25 bg-on-accent/10 text-on-accent shadow-none">
                    1
                  </Kbd>
                </button>
                <button
                  onClick={() => answer(true)}
                  className="flex items-center justify-center gap-1.5 rounded-md bg-good px-3 py-2.5 text-sm font-medium text-on-accent transition-colors duration-150 hover:bg-good-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                >
                  Got it
                  <Kbd className="border-on-accent/25 bg-on-accent/10 text-on-accent shadow-none">
                    2
                  </Kbd>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
