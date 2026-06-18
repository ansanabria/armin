import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ReviewSession } from "@/components/review-session";
import type { CardFormValues } from "@/components/flashcard-form-dialog";
import {
  deckKeys,
  invalidateCoreData,
  reviewKeys,
} from "@/lib/armin-query";
import { toUiFlashcard, toUiReviewUnit } from "@/types/view-models";
import type { Grade } from "@/types/window";
import { useToast } from "@/components/ui/toast";

const ALL_DECKS = "all";
const QUEUE_POLL_MS = 15_000;

export default function ReviewsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [selectedDeckId, setSelectedDeckId] = useState(ALL_DECKS);

  const decksQuery = useQuery({
    queryKey: deckKeys.all,
    queryFn: () => window.armin.decks.list(),
  });

  const queueQuery = useQuery({
    queryKey:
      selectedDeckId === ALL_DECKS
        ? reviewKeys.all
        : reviewKeys.deck(selectedDeckId),
    queryFn: () =>
      selectedDeckId === ALL_DECKS
        ? window.armin.review.queueAll()
        : window.armin.review.queue(selectedDeckId),
    refetchInterval: QUEUE_POLL_MS,
    refetchOnWindowFocus: true,
  });

  const queue = useMemo(
    () => (queueQuery.data ?? []).map(toUiReviewUnit),
    [queueQuery.data],
  );
  const dueCount = queue.length;

  const deckOptions = useMemo(
    () => [
      { value: ALL_DECKS, label: "All decks" },
      ...(decksQuery.data ?? []).map((deck) => ({
        value: deck.id,
        label: deck.name,
      })),
    ],
    [decksQuery.data],
  );

  const rate = useMutation({
    mutationFn: ({ reviewUnitId, rating }: { reviewUnitId: string; rating: Grade }) =>
      window.armin.review.rate(reviewUnitId, rating),
    onSuccess: (card) => {
      invalidateCoreData(queryClient, card.deckId);
    },
    onError: () => toast({ tone: "error", title: "Couldn't save review" }),
  });

  const undo = useMutation({
    mutationFn: (reviewUnitId: string) => window.armin.review.undo(reviewUnitId),
    onSuccess: (result) => {
      if (result) invalidateCoreData(queryClient, result.deckId);
    },
    onError: () => toast({ tone: "error", title: "Couldn't undo review" }),
  });

  const updateCard = useMutation({
    mutationFn: (values: CardFormValues & { id: string }) =>
      window.armin.flashcards.update(values),
    onSuccess: (note) => {
      if (note) invalidateCoreData(queryClient, note.deckId);
      toast({ tone: "success", title: "Flashcard updated" });
    },
    onError: () => toast({ tone: "error", title: "Couldn't update flashcard" }),
  });

  const archiveCard = useMutation({
    mutationFn: (flashcardId: string) => window.armin.flashcards.archive(flashcardId, true),
    onSuccess: (note) => {
      if (note) invalidateCoreData(queryClient, note.deckId);
      toast({ tone: "success", title: "Flashcard archived" });
    },
    onError: () => toast({ tone: "error", title: "Couldn't archive flashcard" }),
  });

  const deleteCard = useMutation({
    mutationFn: (flashcardId: string) => window.armin.flashcards.delete(flashcardId),
    onSuccess: () => {
      invalidateCoreData(queryClient);
      toast({ tone: "error", title: "Flashcard deleted" });
    },
    onError: () => toast({ tone: "error", title: "Couldn't delete flashcard" }),
  });

  return (
    <ReviewSession
      resetKey={selectedDeckId}
      queue={queue}
      isLoading={queueQuery.isLoading || decksQuery.isLoading}
      isError={queueQuery.isError}
      onRetry={() => void queueQuery.refetch()}
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
      deckSelector={
        <Select
          value={selectedDeckId}
          items={deckOptions}
          onValueChange={(value) => setSelectedDeckId(value ?? ALL_DECKS)}
        >
          <SelectTrigger
            size="sm"
            className="min-w-[10rem] border-border-strong"
            aria-label="Deck to review"
          >
            <Layers className="h-3.5 w-3.5 shrink-0 text-muted" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end" alignItemWithTrigger={false}>
            <SelectGroup>
              {deckOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      }
      header={
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-balance">
          Review
        </h1>
      }
      subtitle={
        dueCount > 0
          ? `${dueCount} review units due today across your decks.`
          : "Everything due across your decks, in one queue."
      }
      doneAction={
        <Link to="/">
          <Button variant="outline">Back to decks</Button>
        </Link>
      }
      doneDescription="You cleared every review unit due today. New review units unlock as their prerequisites are learned."
      emptyDescription="Nothing is due right now. Come back when review units are scheduled, or add more to get ahead."
    />
  );
}
