import type { BrowseSortKey as SharedBrowseSortKey } from "../../shared/browse";
import type { UiBrowseFlashcard } from "@/types/view-models";
import { FLASHCARD_SORT_OPTIONS, sortFlashcards } from "./sort-flashcards";

/** Browse adds deck-based ordering on top of the per-deck card sorts. */
export type BrowseSortKey = SharedBrowseSortKey;

export const BROWSE_SORT_OPTIONS: { value: BrowseSortKey; label: string }[] = [
  ...FLASHCARD_SORT_OPTIONS,
  { value: "deck-asc", label: "Deck (A–Z)" },
  { value: "deck-desc", label: "Deck (Z–A)" },
];

export function sortBrowseFlashcards(
  cards: UiBrowseFlashcard[],
  sortKey: BrowseSortKey,
): UiBrowseFlashcard[] {
  if (sortKey === "deck-asc") {
    return [...cards].sort(
      (a, b) =>
        a.deckName.localeCompare(b.deckName) || a.front.localeCompare(b.front),
    );
  }
  if (sortKey === "deck-desc") {
    return [...cards].sort(
      (a, b) =>
        b.deckName.localeCompare(a.deckName) || a.front.localeCompare(b.front),
    );
  }
  return sortFlashcards(cards, sortKey);
}
