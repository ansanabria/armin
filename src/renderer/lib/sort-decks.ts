import type { UiDeck } from "@/types/view-models";

export type DeckSortKey =
  | "name-asc"
  | "name-desc"
  | "total-desc"
  | "total-asc"
  | "due-desc"
  | "due-asc"
  | "new-desc"
  | "new-asc"
  | "learning-desc"
  | "learning-asc"
  | "learned-desc"
  | "learned-asc"
  | "progress-desc"
  | "progress-asc";

export const DECK_SORT_OPTIONS: { value: DeckSortKey; label: string }[] = [
  { value: "name-asc", label: "Name (A–Z)" },
  { value: "name-desc", label: "Name (Z–A)" },
  { value: "total-desc", label: "Most cards" },
  { value: "total-asc", label: "Fewest cards" },
  { value: "due-desc", label: "Most due" },
  { value: "due-asc", label: "Fewest due" },
  { value: "new-desc", label: "Most new" },
  { value: "new-asc", label: "Fewest new" },
  { value: "learning-desc", label: "Most learning" },
  { value: "learning-asc", label: "Fewest learning" },
  { value: "learned-desc", label: "Most learned" },
  { value: "learned-asc", label: "Fewest learned" },
  { value: "progress-desc", label: "Highest progress" },
  { value: "progress-asc", label: "Lowest progress" },
];

function deckProgress(deck: UiDeck) {
  return deck.total > 0 ? deck.learned / deck.total : 0;
}

export function sortDecks(decks: UiDeck[], sortKey: DeckSortKey): UiDeck[] {
  const sorted = [...decks];

  switch (sortKey) {
    case "name-asc":
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    case "name-desc":
      return sorted.sort((a, b) => b.name.localeCompare(a.name));
    case "total-desc":
      return sorted.sort((a, b) => b.total - a.total);
    case "total-asc":
      return sorted.sort((a, b) => a.total - b.total);
    case "due-desc":
      return sorted.sort((a, b) => b.due - a.due);
    case "due-asc":
      return sorted.sort((a, b) => a.due - b.due);
    case "new-desc":
      return sorted.sort((a, b) => b.newCount - a.newCount);
    case "new-asc":
      return sorted.sort((a, b) => a.newCount - b.newCount);
    case "learning-desc":
      return sorted.sort((a, b) => b.learning - a.learning);
    case "learning-asc":
      return sorted.sort((a, b) => a.learning - b.learning);
    case "learned-desc":
      return sorted.sort((a, b) => b.learned - a.learned);
    case "learned-asc":
      return sorted.sort((a, b) => a.learned - b.learned);
    case "progress-desc":
      return sorted.sort((a, b) => deckProgress(b) - deckProgress(a));
    case "progress-asc":
      return sorted.sort((a, b) => deckProgress(a) - deckProgress(b));
  }
}
