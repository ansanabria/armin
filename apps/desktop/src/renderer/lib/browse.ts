import type { BrowseSortKey as SharedBrowseSortKey } from "../../shared/browse";
import { FLASHCARD_SORT_OPTIONS } from "./sort-flashcards";

/** Browse adds deck-based ordering on top of the per-deck card sorts. */
export type BrowseSortKey = SharedBrowseSortKey;

export const BROWSE_SORT_OPTIONS: { value: BrowseSortKey; label: string }[] = [
  ...FLASHCARD_SORT_OPTIONS,
  { value: "deck-asc", label: "Deck (A–Z)" },
  { value: "deck-desc", label: "Deck (Z–A)" },
];
