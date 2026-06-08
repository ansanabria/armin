import { describe, expect, it } from "vitest";
import type { CardWithMeta } from "@/types/window";
import { formatDueLabel, toUiBrowseCard, toUiCard } from "./view-models";

function card(overrides: Partial<CardWithMeta> = {}): CardWithMeta {
  const now = new Date("2026-06-07T12:00:00.000Z");
  return {
    id: "card-1",
    deckId: "deck-1",
    front: "Prompt",
    back: "Answer",
    type: "basic",
    due: now,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    learningSteps: 0,
    reps: 0,
    lapses: 0,
    state: 1,
    lastReview: null,
    createdAt: now,
    updatedAt: now,
    tags: [],
    locked: false,
    ...overrides,
  };
}

describe("view-model helpers", () => {
  it("formats locked, new, due, and future cards", () => {
    const now = new Date("2026-06-07T12:00:00.000Z");

    expect(formatDueLabel(card({ locked: true }), now)).toBe("Locked");
    expect(formatDueLabel(card({ state: 0 }), now)).toBe("New");
    expect(formatDueLabel(card({ due: now }), now)).toBe("Due now");
    expect(
      formatDueLabel(
        card({ due: new Date("2026-06-07T12:06:00.000Z") }),
        now,
      ),
    ).toBe("in 6m");
    expect(
      formatDueLabel(
        card({ due: new Date("2026-06-10T12:00:00.000Z") }),
        now,
      ),
    ).toBe("in 3 days");
  });

  it("maps card metadata to UI card shapes", () => {
    const uiCard = toUiCard(
      card({
        state: 2,
        tags: ["typescript"],
      }),
    );

    expect(uiCard).toMatchObject({
      id: "card-1",
      deckId: "deck-1",
      state: 2,
      tags: ["typescript"],
    });
  });

  it("preserves deck context for browse cards", () => {
    expect(toUiBrowseCard({ ...card(), deckName: "JavaScript" })).toMatchObject({
      deckName: "JavaScript",
      deckId: "deck-1",
    });
  });
});
