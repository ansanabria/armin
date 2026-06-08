import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ReviewSession } from "@/components/review-session";
import { invalidateCoreData, reviewKeys } from "@/lib/armin-query";
import { toUiReviewCard } from "@/types/view-models";
import type { Grade } from "@/types/window";
import { useToast } from "@/components/ui/toast";

export default function ReviewsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const queueQuery = useQuery({
    queryKey: reviewKeys.all,
    queryFn: () => window.armin.review.queueAll(),
  });
  const queue = useMemo(
    () => (queueQuery.data ?? []).map(toUiReviewCard),
    [queueQuery.data],
  );
  const dueCount = queue.length;

  const rate = useMutation({
    mutationFn: ({ cardId, rating }: { cardId: string; rating: Grade }) =>
      window.armin.review.rate(cardId, rating),
    onSuccess: (card) => {
      invalidateCoreData(queryClient, card.deckId);
    },
    onError: () => toast({ tone: "error", title: "Couldn’t save review" }),
  });

  return (
    <ReviewSession
      queue={queue}
      isLoading={queueQuery.isLoading}
      isError={queueQuery.isError}
      onRetry={() => void queueQuery.refetch()}
      loadPreview={(cardId) => window.armin.review.preview(cardId)}
      onRate={(cardId, rating) =>
        rate.mutateAsync({ cardId, rating }).then(() => undefined)
      }
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
