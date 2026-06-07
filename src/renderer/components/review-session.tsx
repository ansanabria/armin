import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { usePreview } from "@/preview/preview-context";
import { intervalPreview, type UiReviewCard } from "@/data/fixtures";
import type { Grade } from "@/types/window";
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

export type ReviewSessionProps = {
  /** Cards due for this session. Tag cards with `deck` to show the source. */
  queue: UiReviewCard[];
  /** Top-of-page content — a back link or a page title. */
  header: ReactNode;
  /** Secondary line under the header (e.g. due count). Session progress aligns right. */
  subtitle?: ReactNode;
  /** Action shown in the empty/done panel (typically a back button). */
  doneAction: ReactNode;
  /** Copy for the "all caught up" panel after clearing the queue. */
  doneDescription: string;
  /** Copy for the "all caught up" panel when nothing was due. */
  emptyDescription: string;
  /** Changing this resets the session to the first card. */
  resetKey?: string;
};

export function ReviewSession({
  queue,
  header,
  subtitle,
  doneAction,
  doneDescription,
  emptyDescription,
  resetKey,
}: ReviewSessionProps) {
  // UI PREVIEW ONLY: `scenario` stands in for the queue query status.
  const { scenario, setScenario } = usePreview();

  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const cards = scenario === "ready" ? queue : [];
  const card = cards[index];
  const done = scenario === "ready" && index >= cards.length && cards.length > 0;
  const empty = scenario === "empty" || (scenario === "ready" && cards.length === 0);

  // The chosen grade drives FSRS when wired up; here it just advances.
  const rate = () => {
    setFlipped(false);
    setIndex((i) => i + 1);
  };

  useEffect(() => {
    setIndex(0);
    setFlipped(false);
  }, [scenario, resetKey]);

  useEffect(() => {
    if (scenario !== "ready" || !card) return;
    const onKey = (e: KeyboardEvent) => {
      if (!flipped && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        setFlipped(true);
      } else if (flipped && ["1", "2", "3", "4"].includes(e.key)) {
        rate();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scenario, card, flipped]);

  return (
    <div className="mx-auto max-w-2xl">
      {header}

      {(subtitle || (scenario === "ready" && card)) && (
        <div
          className={cn(
            "mt-1.5 flex items-baseline gap-4 text-sm",
            subtitle && "justify-between",
          )}
        >
          {subtitle && <p className="min-w-0 text-muted">{subtitle}</p>}
          {scenario === "ready" && card && (
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

      {scenario === "loading" && (
        <div className="mt-6">
          <Skeleton className="h-1.5 w-full rounded-full" />
          <Skeleton className="mt-6 h-[260px] w-full rounded-xl" />
          <Skeleton className="mt-6 h-11 w-full" />
        </div>
      )}

      {scenario === "error" && (
        <div className="mt-10 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-relearning-bg text-relearning">
            <AlertTriangle className="h-6 w-6" strokeWidth={1.5} />
          </div>
          <h2 className="text-xl font-semibold">Review couldn&apos;t start</h2>
          <p className="mt-1 max-w-[40ch] text-sm text-muted">
            The scheduler hit a snag building your queue.
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

      {(empty || done) && (
        <div className="mt-16 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-review-bg text-good">
            <CheckCircle2 className="h-7 w-7" strokeWidth={1.5} />
          </div>
          <h2 className="text-xl font-semibold tracking-tight">All caught up</h2>
          <p className="mt-1.5 max-w-[44ch] text-pretty text-sm text-muted">
            {done ? doneDescription : emptyDescription}
          </p>
          <div className="mt-6">{doneAction}</div>
        </div>
      )}

      {scenario === "ready" && card && (
        <div className="mt-8">
          <Progress value={index} max={cards.length} className="mb-8" />

          <div className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-border-strong bg-paper px-10 py-12 text-center">
            <MarkdownContent
              content={card.front}
              className="max-w-[52ch] text-pretty text-xl font-medium leading-snug text-balance"
            />
            {flipped && (
              <div className="animate-flip-in flex w-full flex-col items-center">
                <div className="my-7 h-px w-16 bg-border-strong" />
                <MarkdownContent
                  content={card.back}
                  className="max-w-[52ch] text-pretty text-lg leading-relaxed text-ink/90"
                />
              </div>
            )}
          </div>

          <div className="mt-6">
            {!flipped ? (
              <Button
                size="lg"
                className="w-full"
                onClick={() => setFlipped(true)}
              >
                Show answer
                <Kbd className="ml-1 border-on-accent/25 bg-on-accent/10 text-on-accent shadow-none">
                  Space
                </Kbd>
              </Button>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {RATINGS.map((r) => (
                  <button
                    key={r.grade}
                    onClick={() => rate()}
                    className={`flex flex-col items-center gap-0.5 rounded-md px-3 py-2.5 text-sm font-medium text-on-accent transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${r.bg}`}
                  >
                    <span className="flex items-center gap-1.5">
                      {r.label}
                      <Kbd className="border-on-accent/25 bg-on-accent/10 text-on-accent shadow-none">
                        {r.grade}
                      </Kbd>
                    </span>
                    <span className="font-mono text-xs text-on-accent/85">
                      {intervalPreview[r.grade]}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
