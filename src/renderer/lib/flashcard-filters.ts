import type { ReviewState } from "@/components/ui/badge";
import type { UiBrowseFlashcard, UiFlashcard } from "@/types/view-models";

/** Selectable card states, in learning order. */
export const STATE_OPTIONS: { value: ReviewState; label: string }[] = [
  { value: 0, label: "New" },
  { value: 1, label: "Learning" },
  { value: 2, label: "Review" },
  { value: 3, label: "Relearning" },
];

/** OR-match: a card passes if it carries at least one of the selected tags. */
export function matchesTags(card: UiFlashcard, selected: string[]): boolean {
  if (selected.length === 0) return true;
  const tags = card.tags ?? [];
  return selected.some((t) => tags.includes(t));
}

export function matchesStates(card: UiFlashcard, selected: ReviewState[]): boolean {
  if (selected.length === 0) return true;
  return selected.includes(card.state);
}

export function matchesDecks(card: UiBrowseFlashcard, selected: string[]): boolean {
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
