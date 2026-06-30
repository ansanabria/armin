import type { QueryClient } from "@tanstack/react-query";
import { deckKeys } from "@/lib/armin-query";
import type { UiDeck } from "@/types/view-models";

export function getCachedDeckDetail(queryClient: QueryClient, deckId: string) {
  return queryClient
    .getQueryData<UiDeck[]>(deckKeys.all)
    ?.find((deck) => deck.id === deckId);
}

export function getCachedDeckDetailUpdatedAt(
  queryClient: QueryClient,
  deckId: string,
) {
  return getCachedDeckDetail(queryClient, deckId)
    ? queryClient.getQueryState(deckKeys.all)?.dataUpdatedAt
    : undefined;
}
