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

export const cardKeys = {
  all: ["cards"] as const,
  deck: (deckId: string) => ["cards", "deck", deckId] as const,
  deckTags: (deckId: string) => ["cards", "deck-tags", deckId] as const,
  browse: (filters: BrowseQueryFilters) =>
    ["cards", "browse", filters] as const,
  tags: ["cards", "tags"] as const,
};

export const reviewKeys = {
  all: ["review", "all"] as const,
  deck: (deckId: string) => ["review", "deck", deckId] as const,
  preview: (cardId: string) => ["review", "preview", cardId] as const,
};

export const graphKeys = {
  deck: (deckId: string) => ["graph", "deck", deckId] as const,
};

export const settingsKeys = {
  current: ["settings"] as const,
};

export const mcpKeys = {
  setup: ["mcp", "setup"] as const,
};

export function invalidateCoreData(queryClient: QueryClient, deckId?: string) {
  void queryClient.invalidateQueries({ queryKey: deckKeys.all });
  void queryClient.invalidateQueries({ queryKey: cardKeys.all });
  void queryClient.invalidateQueries({ queryKey: ["cards", "browse"] });
  void queryClient.invalidateQueries({ queryKey: cardKeys.tags });
  void queryClient.invalidateQueries({ queryKey: reviewKeys.all });

  if (deckId) {
    void queryClient.invalidateQueries({ queryKey: deckKeys.detail(deckId) });
    void queryClient.invalidateQueries({ queryKey: cardKeys.deck(deckId) });
    void queryClient.invalidateQueries({ queryKey: cardKeys.deckTags(deckId) });
    void queryClient.invalidateQueries({ queryKey: reviewKeys.deck(deckId) });
    void queryClient.invalidateQueries({ queryKey: graphKeys.deck(deckId) });
  }
}
