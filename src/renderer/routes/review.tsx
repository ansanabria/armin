import { useEffect, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { usePreview } from "@/preview/preview-context";
import { getDeck, getReviewQueue, intervalPreview } from "@/data/fixtures";
import type { Grade } from "@/types/window";

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

export default function ReviewPage() {
  const { deckId } = useParams({ from: "/deck/$deckId/review" });
  // UI PREVIEW ONLY: `scenario` stands in for the queue query status.
  const { scenario, setScenario } = usePreview();

  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const deck = getDeck(deckId);
  const queue =
    scenario === "empty" || scenario === "loading" || scenario === "error"
      ? []
      : getReviewQueue(deckId);
  const card = queue[index];
  const done = scenario === "ready" && index >= queue.length;

  // The chosen grade drives FSRS when wired up; here it just advances.
  const rate = () => {
    setFlipped(false);
    setIndex((i) => i + 1);
  };

  useEffect(() => {
    setIndex(0);
    setFlipped(false);
  }, [scenario, deckId]);

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

  const back = (
    <Link
      to="/deck/$deckId"
      params={{ deckId }}
      className="inline-flex items-center gap-1 rounded-sm text-sm text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petrol"
    >
      <ArrowLeft className="h-4 w-4" /> Back to deck
    </Link>
  );

  return (
    <div className="mx-auto max-w-2xl">
      {back}

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

      {!deck && scenario === "ready" && (
        <div className="mt-16 flex flex-col items-center text-center">
          <h2 className="text-xl font-semibold">Deck not found</h2>
          <p className="mt-1 text-sm text-muted">
            This deck isn&apos;t in your library anymore.
          </p>
          <Link to="/" className="mt-6">
            <Button variant="outline">Back to decks</Button>
          </Link>
        </div>
      )}

      {deck && (scenario === "empty" || done) && (
        <div className="mt-16 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-review-bg text-good">
            <CheckCircle2 className="h-7 w-7" strokeWidth={1.5} />
          </div>
          <h2 className="text-xl font-semibold tracking-tight">
            All caught up
          </h2>
          <p className="mt-1.5 max-w-[44ch] text-pretty text-sm text-muted">
            {done
              ? "You cleared every card due in this deck. New cards unlock as their prerequisites are learned."
              : "Nothing is due here right now. Come back when cards are scheduled, or add more to get ahead."}
          </p>
          <Link to="/deck/$deckId" params={{ deckId }} className="mt-6">
            <Button variant="outline">Back to deck</Button>
          </Link>
        </div>
      )}

      {deck && scenario === "ready" && card && (
        <div className="mt-6">
          <div className="mb-6 flex items-center gap-4">
            <Progress
              value={index}
              max={queue.length}
              className="flex-1"
            />
            <span className="shrink-0 font-mono text-xs text-muted">
              {index + 1} / {queue.length}
            </span>
          </div>

          <div className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-border bg-surface p-10 text-center shadow-lift">
            <p className="text-xl font-medium leading-snug text-balance">
              {card.front}
            </p>
            {flipped && (
              <div className="animate-flip-in flex flex-col items-center">
                <div className="my-6 h-px w-20 bg-border" />
                <p className="max-w-[52ch] text-pretty text-lg leading-relaxed text-ink/85">
                  {card.back}
                </p>
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
                <Kbd className="ml-1 border-white/30 bg-white/15 text-white shadow-none">
                  Space
                </Kbd>
              </Button>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {RATINGS.map((r) => (
                  <button
                    key={r.grade}
                    onClick={() => rate()}
                    className={`flex flex-col items-center gap-0.5 rounded-md px-3 py-2.5 text-sm font-medium text-white transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${r.bg}`}
                  >
                    <span className="flex items-center gap-1.5">
                      {r.label}
                      <Kbd className="border-white/30 bg-white/15 text-white shadow-none">
                        {r.grade}
                      </Kbd>
                    </span>
                    <span className="font-mono text-xs text-white/85">
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
