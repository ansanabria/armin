import type { CardState } from "@/components/ui/badge";
import type { UiBrowseCard, UiCard } from "@/types/view-models";

/** Selectable card states, in learning order. */
export const STATE_OPTIONS: { value: CardState; label: string }[] = [
  { value: 0, label: "New" },
  { value: 1, label: "Learning" },
  { value: 2, label: "Review" },
  { value: 3, label: "Relearning" },
];

/** OR-match: a card passes if it carries at least one of the selected tags. */
export function matchesTags(card: UiCard, selected: string[]): boolean {
  if (selected.length === 0) return true;
  const tags = card.tags ?? [];
  return selected.some((t) => tags.includes(t));
}

export function matchesStates(card: UiCard, selected: CardState[]): boolean {
  if (selected.length === 0) return true;
  return selected.includes(card.state);
}

export function matchesDecks(card: UiBrowseCard, selected: string[]): boolean {
  if (selected.length === 0) return true;
  return selected.includes(card.deckId);
}

/** Add/remove a value from a selection array (for toggle chips). */
export function toggleValue<T>(list: T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value];
}

export function formatCreatedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
