import type { UiCard } from "@/types/view-models";

export type CardSortKey =
  | "due-soon"
  | "due-later"
  | "created-new"
  | "created-old"
  | "front-asc"
  | "front-desc"
  | "back-asc"
  | "back-desc"
  | "state-asc"
  | "state-desc"
  | "locked-first"
  | "locked-last";

export const CARD_SORT_OPTIONS: { value: CardSortKey; label: string }[] = [
  { value: "due-soon", label: "Due soonest" },
  { value: "due-later", label: "Due latest" },
  { value: "created-new", label: "Newest first" },
  { value: "created-old", label: "Oldest first" },
  { value: "front-asc", label: "Front (A–Z)" },
  { value: "front-desc", label: "Front (Z–A)" },
  { value: "back-asc", label: "Back (A–Z)" },
  { value: "back-desc", label: "Back (Z–A)" },
  { value: "state-asc", label: "State (New → Review)" },
  { value: "state-desc", label: "State (Review → New)" },
  { value: "locked-first", label: "Locked first" },
  { value: "locked-last", label: "Locked last" },
];

/** Lower = due sooner. Mirrors fixture due-label strings for preview data. */
export function dueLabelPriority(label: string): number {
  if (label === "Due now") return 0;

  const minutes = label.match(/^in (\d+)m$/);
  if (minutes) return 1 + Number(minutes[1]) / 1000;

  const days = label.match(/^in (\d+) days?$/);
  if (days) return 10 + Number(days[1]);

  if (label === "New") return 90;
  if (label === "Locked") return 95;
  return 80;
}

export function sortCards<T extends UiCard>(
  cards: T[],
  sortKey: CardSortKey,
): T[] {
  const sorted = [...cards];

  switch (sortKey) {
    case "due-soon":
      return sorted.sort(
        (a, b) => dueLabelPriority(a.dueLabel) - dueLabelPriority(b.dueLabel),
      );
    case "due-later":
      return sorted.sort(
        (a, b) => dueLabelPriority(b.dueLabel) - dueLabelPriority(a.dueLabel),
      );
    case "created-new":
      return sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    case "created-old":
      return sorted.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    case "front-asc":
      return sorted.sort((a, b) => a.front.localeCompare(b.front));
    case "front-desc":
      return sorted.sort((a, b) => b.front.localeCompare(a.front));
    case "back-asc":
      return sorted.sort((a, b) => a.back.localeCompare(b.back));
    case "back-desc":
      return sorted.sort((a, b) => b.back.localeCompare(a.back));
    case "state-asc":
      return sorted.sort((a, b) => a.state - b.state);
    case "state-desc":
      return sorted.sort((a, b) => b.state - a.state);
    case "locked-first":
      return sorted.sort((a, b) => Number(b.locked) - Number(a.locked));
    case "locked-last":
      return sorted.sort((a, b) => Number(a.locked) - Number(b.locked));
  }
}
