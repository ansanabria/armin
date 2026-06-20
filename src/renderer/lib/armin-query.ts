import type { QueryClient } from "@tanstack/react-query";

export const deckKeys = {
  all: ["decks"] as const,
  detail: (deckId: string) => ["decks", deckId] as const,
};

export type BrowseQueryFilters = {
  sort: string;
  state?: number;
  deckId?: string;
  tags?: string[];
};

export const flashcardKeys = {
  all: ["flashcards"] as const,
  deck: (deckId: string) => ["flashcards", "deck", deckId] as const,
  deckTags: (deckId: string) => ["flashcards", "deck-tags", deckId] as const,
  browse: (filters: BrowseQueryFilters) =>
    ["flashcards", "browse", filters] as const,
  tags: ["flashcards", "tags"] as const,
};

export const reviewKeys = {
  all: ["review", "all"] as const,
  deck: (deckId: string) => ["review", "deck", deckId] as const,
  preview: (reviewUnitId: string) => ["review", "preview", reviewUnitId] as const,
};

export const graphKeys = {
  global: ["graph", "global"] as const,
};

export const settingsKeys = {
  current: ["settings"] as const,
  deck: (deckId: string) => ["settings", "deck", deckId] as const,
};

export const mcpKeys = {
  setup: ["mcp", "setup"] as const,
  enabled: ["mcp", "enabled"] as const,
};

export function invalidateCoreData(queryClient: QueryClient, deckId?: string) {
  void queryClient.invalidateQueries({ queryKey: deckKeys.all });
  void queryClient.invalidateQueries({ queryKey: flashcardKeys.all });
  void queryClient.invalidateQueries({ queryKey: ["flashcards", "browse"] });
  void queryClient.invalidateQueries({ queryKey: flashcardKeys.tags });
  void queryClient.invalidateQueries({ queryKey: reviewKeys.all });
  void queryClient.invalidateQueries({ queryKey: graphKeys.global });

  if (deckId) {
    void queryClient.invalidateQueries({ queryKey: deckKeys.detail(deckId) });
    void queryClient.invalidateQueries({ queryKey: flashcardKeys.deck(deckId) });
    void queryClient.invalidateQueries({ queryKey: flashcardKeys.deckTags(deckId) });
    void queryClient.invalidateQueries({ queryKey: reviewKeys.deck(deckId) });
  }
}
