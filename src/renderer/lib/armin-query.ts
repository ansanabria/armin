import type { QueryClient } from "@tanstack/react-query";

export const deckKeys = {
  all: ["decks"] as const,
  detail: (deckId: string) => ["decks", deckId] as const,
};

export const cardKeys = {
  all: ["cards"] as const,
  deck: (deckId: string) => ["cards", "deck", deckId] as const,
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

export function invalidateCoreData(
  queryClient: QueryClient,
  deckId?: string,
) {
  void queryClient.invalidateQueries({ queryKey: deckKeys.all });
  void queryClient.invalidateQueries({ queryKey: cardKeys.all });
  void queryClient.invalidateQueries({ queryKey: reviewKeys.all });

  if (deckId) {
    void queryClient.invalidateQueries({ queryKey: deckKeys.detail(deckId) });
    void queryClient.invalidateQueries({ queryKey: cardKeys.deck(deckId) });
    void queryClient.invalidateQueries({ queryKey: reviewKeys.deck(deckId) });
    void queryClient.invalidateQueries({ queryKey: graphKeys.deck(deckId) });
  }
}
