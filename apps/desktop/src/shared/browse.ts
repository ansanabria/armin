/** Shared browse pagination + sort keys (main process + renderer). */

export const BROWSE_PAGE_SIZE = 30;

export const BROWSE_SORT_KEYS = [
  "due-soon",
  "due-later",
  "created-new",
  "created-old",
  "front-asc",
  "front-desc",
  "back-asc",
  "back-desc",
  "state-asc",
  "state-desc",
  "locked-first",
  "locked-last",
  "deck-asc",
  "deck-desc",
] as const;

export type BrowseSortKey = (typeof BROWSE_SORT_KEYS)[number];
