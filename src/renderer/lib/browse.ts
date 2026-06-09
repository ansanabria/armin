import type { BrowseSortKey as SharedBrowseSortKey } from "../../shared/browse";
import type { UiBrowseCard } from "@/types/view-models";
import { CARD_SORT_OPTIONS, sortCards } from "./sort-cards";

/** Browse adds deck-based ordering on top of the per-deck card sorts. */
export type BrowseSortKey = SharedBrowseSortKey;

export const BROWSE_SORT_OPTIONS: { value: BrowseSortKey; label: string }[] = [
  ...CARD_SORT_OPTIONS,
  { value: "deck-asc", label: "Deck (A–Z)" },
  { value: "deck-desc", label: "Deck (Z–A)" },
];

export function sortBrowseCards(
  cards: UiBrowseCard[],
  sortKey: BrowseSortKey,
): UiBrowseCard[] {
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
  return sortCards(cards, sortKey);
}
