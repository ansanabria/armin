import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { deckKeys, invalidateCoreData } from "@/lib/armin-query";
import { stripMarkdownForPreview } from "@/lib/markdown-preview";

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export type MovableFlashcard = {
  id: string;
  deckId: string;
  front?: string;
};

/**
 * Moves a flashcard into another deck. Because the prerequisite graph is bound
 * to a deck, moving a connected card severs its prerequisite and dependent
 * edges; the dialog warns about that before the move is committed.
 */
export function MoveFlashcardDialog({
  flashcard,
  open,
  onClose,
  onMoved,
}: {
  flashcard: MovableFlashcard | null;
  open: boolean;
  onClose: () => void;
  onMoved?: (targetDeckId: string) => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [targetDeckId, setTargetDeckId] = useState<string | null>(null);

  const decksQuery = useQuery({
    queryKey: deckKeys.all,
    queryFn: () => window.armin.decks.list(),
    enabled: open,
  });
  const consequencesQuery = useQuery({
    queryKey: ["flashcards", "move-consequences", flashcard?.id],
    queryFn: () => window.armin.flashcards.moveConsequences(flashcard!.id),
    enabled: open && Boolean(flashcard),
  });

  const otherDecks = (decksQuery.data ?? []).filter(
    (deck) => deck.id !== flashcard?.deckId,
  );

  // Reset the picked deck each time the dialog opens, then default it to the
  // first available target once decks load.
  useEffect(() => {
    if (!open) setTargetDeckId(null);
  }, [open]);
  useEffect(() => {
    if (open && targetDeckId === null && otherDecks.length > 0) {
      setTargetDeckId(otherDecks[0].id);
    }
  }, [open, targetDeckId, otherDecks]);

  const move = useMutation({
    mutationFn: () =>
      window.armin.flashcards.move(flashcard!.id, targetDeckId!),
    onSuccess: () => {
      const sourceDeckId = flashcard!.deckId;
      const destinationDeckId = targetDeckId!;
      invalidateCoreData(queryClient, sourceDeckId);
      invalidateCoreData(queryClient, destinationDeckId);
      toast({ tone: "success", title: "Flashcard moved" });
      onMoved?.(destinationDeckId);
      onClose();
    },
    onError: () => toast({ tone: "error", title: "Couldn’t move flashcard" }),
  });

  const consequences = consequencesQuery.data;
  const linkCount = consequences
    ? consequences.prerequisiteCount + consequences.dependentCount
    : 0;
  const hasLinks = linkCount > 0;
  const noTargets = !decksQuery.isLoading && otherDecks.length === 0;
  const preview = flashcard?.front
    ? stripMarkdownForPreview(flashcard.front)
    : "";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Move flashcard to deck"
      description={
        preview
          ? `“${preview.length > 100 ? `${preview.slice(0, 100)}…` : preview}” will be filed under the deck you choose.`
          : "Choose the deck this flashcard should be filed under."
      }
    >
      {noTargets ? (
        <p className="text-sm text-muted">
          There are no other decks to move this flashcard into. Create another
          deck first.
        </p>
      ) : (
        <div className="space-y-4">
          <Select
            value={targetDeckId ?? undefined}
            items={otherDecks.map((deck) => ({
              value: deck.id,
              label: deck.name,
            }))}
            onValueChange={(next) => setTargetDeckId(next as string)}
          >
            <SelectTrigger className="w-full" aria-label="Destination deck">
              <SelectValue placeholder="Select a deck" />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                {otherDecks.map((deck) => (
                  <SelectItem key={deck.id} value={deck.id}>
                    {deck.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          {hasLinks && (
            <div className="rounded-md border border-border bg-surface-sunken p-3 text-sm text-muted">
              <p>
                Prerequisites only connect cards in the same deck, so moving this
                flashcard will remove{" "}
                {consequences!.prerequisiteCount > 0 &&
                  plural(consequences!.prerequisiteCount, "prerequisite link")}
                {consequences!.prerequisiteCount > 0 &&
                consequences!.dependentCount > 0
                  ? " and "
                  : ""}
                {consequences!.dependentCount > 0 &&
                  plural(consequences!.dependentCount, "dependent link")}
                .
              </p>
            </div>
          )}
        </div>
      )}

      <div className="mt-5 flex flex-wrap justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        {!noTargets && (
          <Button
            disabled={!targetDeckId || consequencesQuery.isLoading}
            busy={move.isPending}
            onClick={() => move.mutate()}
          >
            {hasLinks ? "Move and remove links" : "Move flashcard"}
          </Button>
        )}
      </div>
    </Dialog>
  );
}
