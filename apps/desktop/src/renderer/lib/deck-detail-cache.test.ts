import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { deckKeys } from "@/lib/armin-query";
import {
  getCachedDeckDetail,
  getCachedDeckDetailUpdatedAt,
} from "@/lib/deck-detail-cache";
import type { UiDeck } from "@/types/view-models";

function deck(overrides: Partial<UiDeck> & Pick<UiDeck, "id" | "name">): UiDeck {
  return {
    id: overrides.id,
    name: overrides.name,
    description: overrides.description ?? null,
    createdAt: overrides.createdAt ?? new Date("2026-01-01T00:00:00Z"),
    updatedAt: overrides.updatedAt ?? new Date("2026-01-01T00:00:00Z"),
    total: overrides.total ?? 0,
    learned: overrides.learned ?? 0,
    due: overrides.due ?? 0,
    newCount: overrides.newCount ?? 0,
    learning: overrides.learning ?? 0,
  };
}

describe("deck detail cache seeding", () => {
  it("uses matching deck list data immediately", () => {
    const queryClient = new QueryClient();
    const cachedDeck = deck({ id: "deck-1", name: "Biology" });

    queryClient.setQueryData(deckKeys.all, [
      cachedDeck,
      deck({ id: "deck-2", name: "Chemistry" }),
    ]);

    expect(getCachedDeckDetail(queryClient, "deck-1")).toBe(cachedDeck);
    expect(getCachedDeckDetailUpdatedAt(queryClient, "deck-1")).toBe(
      queryClient.getQueryState(deckKeys.all)?.dataUpdatedAt,
    );
  });

  it("falls back to loading when the deck list has no matching deck", () => {
    const queryClient = new QueryClient();

    queryClient.setQueryData(deckKeys.all, [
      deck({ id: "deck-2", name: "Chemistry" }),
    ]);

    expect(getCachedDeckDetail(queryClient, "missing")).toBeUndefined();
    expect(getCachedDeckDetailUpdatedAt(queryClient, "missing")).toBeUndefined();
  });
});
