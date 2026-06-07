import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ReviewSession } from "@/components/review-session";
import { usePreview } from "@/preview/preview-context";
import { getGlobalReviewQueue, totalDueToday } from "@/data/fixtures";

export default function ReviewsPage() {
  // UI PREVIEW ONLY: `scenario` stands in for the queue query status.
  const { scenario } = usePreview();

  const queue = getGlobalReviewQueue();
  const dueCount = scenario === "ready" ? totalDueToday : 0;

  return (
    <ReviewSession
      queue={queue}
      header={
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-balance">
          Review
        </h1>
      }
      subtitle={
        dueCount > 0
          ? `${dueCount} cards due today across your decks.`
          : "Everything due across your decks, in one queue."
      }
      doneAction={
        <Link to="/">
          <Button variant="outline">Back to decks</Button>
        </Link>
      }
      doneDescription="You cleared every card due today. New cards unlock as their prerequisites are learned."
      emptyDescription="Nothing is due right now. Come back when cards are scheduled, or add more to get ahead."
    />
  );
}
