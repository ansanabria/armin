export type FlashcardSortKey =
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

export const FLASHCARD_SORT_OPTIONS: {
  value: FlashcardSortKey;
  label: string;
}[] = [
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
