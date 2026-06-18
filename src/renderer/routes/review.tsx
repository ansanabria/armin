import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReviewSession } from "@/components/review-session";
import type { CardFormValues } from "@/components/flashcard-form-dialog";
import { deckKeys, invalidateCoreData, reviewKeys } from "@/lib/armin-query";
import { toUiFlashcard, toUiReviewUnit } from "@/types/view-models";
import type { Grade } from "@/types/window";
import { useToast } from "@/components/ui/toast";

const QUEUE_POLL_MS = 15_000;

export default function ReviewPage() {
  const { deckId } = useParams({ from: "/deck/$deckId/review" });
  const queryClient = useQueryClient();
  const toast = useToast();

  const deckQuery = useQuery({
    queryKey: deckKeys.detail(deckId),
    queryFn: () => window.armin.decks.get(deckId),
  });
  const queueQuery = useQuery({
    queryKey: reviewKeys.deck(deckId),
    queryFn: () => window.armin.review.queue(deckId),
    refetchInterval: QUEUE_POLL_MS,
    refetchOnWindowFocus: true,
  });

  const queue = useMemo(
    () => (queueQuery.data ?? []).map(toUiReviewUnit),
    [queueQuery.data],
  );

  const rate = useMutation({
    mutationFn: ({ reviewUnitId, rating }: { reviewUnitId: string; rating: Grade }) =>
      window.armin.review.rate(reviewUnitId, rating),
    onSuccess: () => {
      invalidateCoreData(queryClient, deckId);
    },
    onError: () => toast({ tone: "error", title: "Couldn't save review" }),
  });

  const undo = useMutation({
    mutationFn: (reviewUnitId: string) => window.armin.review.undo(reviewUnitId),
    onSuccess: () => {
      invalidateCoreData(queryClient, deckId);
    },
    onError: () => toast({ tone: "error", title: "Couldn't undo review" }),
  });

  const updateCard = useMutation({
    mutationFn: (values: CardFormValues & { id: string }) =>
      window.armin.flashcards.update(values),
    onSuccess: () => {
      invalidateCoreData(queryClient, deckId);
      toast({ tone: "success", title: "Flashcard updated" });
    },
    onError: () => toast({ tone: "error", title: "Couldn't update flashcard" }),
  });

  const archiveCard = useMutation({
    mutationFn: (flashcardId: string) => window.armin.flashcards.archive(flashcardId, true),
    onSuccess: () => {
      invalidateCoreData(queryClient, deckId);
      toast({ tone: "success", title: "Flashcard archived" });
    },
    onError: () => toast({ tone: "error", title: "Couldn't archive flashcard" }),
  });

  const deleteCard = useMutation({
    mutationFn: (flashcardId: string) => window.armin.flashcards.delete(flashcardId),
    onSuccess: () => {
      invalidateCoreData(queryClient, deckId);
      toast({ tone: "error", title: "Flashcard deleted" });
    },
    onError: () => toast({ tone: "error", title: "Couldn't delete flashcard" }),
  });

  if (!deckQuery.isLoading && !deckQuery.isError && !deckQuery.data) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="mt-16 flex flex-col items-center border border-border bg-bg-2 px-6 py-14 text-center">
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
      queue={queue}
      isLoading={deckQuery.isLoading || queueQuery.isLoading}
      isError={deckQuery.isError || queueQuery.isError}
      onRetry={() => {
        void deckQuery.refetch();
        void queueQuery.refetch();
      }}
      loadPreview={(reviewUnitId) => window.armin.review.preview(reviewUnitId)}
      onRate={(reviewUnitId, rating) =>
        rate.mutateAsync({ reviewUnitId, rating }).then(() => undefined)
      }
      onUndo={(reviewUnitId) =>
        undo.mutateAsync(reviewUnitId).then(() => undefined)
      }
      loadCard={async (flashcardId) => {
        const note = await window.armin.flashcards.get(flashcardId);
        return note ? toUiFlashcard(note) : undefined;
      }}
      onEditFlashcard={(flashcardId, values) =>
        updateCard.mutateAsync({ id: flashcardId, ...values }).then(() => undefined)
      }
      onArchiveFlashcard={(flashcardId) =>
        archiveCard.mutateAsync(flashcardId).then(() => undefined)
      }
      onDeleteFlashcard={(flashcardId) =>
        deleteCard.mutateAsync(flashcardId).then(() => undefined)
      }
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
      doneDescription="You cleared every review unit due in this deck. New review units unlock as their prerequisites are learned."
      emptyDescription="Nothing is due here right now. Come back when review units are scheduled, or add more to get ahead."
    />
  );
}
