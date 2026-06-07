import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReviewSession } from "@/components/review-session";
import { usePreview } from "@/preview/preview-context";
import { getDeck, getReviewQueue } from "@/data/fixtures";

export default function ReviewPage() {
  const { deckId } = useParams({ from: "/deck/$deckId/review" });
  // UI PREVIEW ONLY: `scenario` stands in for the queue query status.
  const { scenario } = usePreview();

  const deck = getDeck(deckId);

  if (!deck && scenario === "ready") {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="mt-16 flex flex-col items-center text-center">
          <h2 className="text-xl font-semibold">Deck not found</h2>
          <p className="mt-1 text-sm text-muted">
            This deck isn&apos;t in your library anymore.
          </p>
          <Link to="/" className="mt-6">
            <Button variant="outline">Back to decks</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <ReviewSession
      resetKey={deckId}
      queue={getReviewQueue(deckId)}
      header={
        <Link
          to="/deck/$deckId"
          params={{ deckId }}
          className="inline-flex items-center gap-1 rounded-sm text-sm text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ArrowLeft className="h-4 w-4" /> Back to deck
        </Link>
      }
      doneAction={
        <Link to="/deck/$deckId" params={{ deckId }}>
          <Button variant="outline">Back to deck</Button>
        </Link>
      }
      doneDescription="You cleared every card due in this deck. New cards unlock as their prerequisites are learned."
      emptyDescription="Nothing is due here right now. Come back when cards are scheduled, or add more to get ahead."
    />
  );
}
