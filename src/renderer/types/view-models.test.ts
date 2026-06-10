import { describe, expect, it } from "vitest";
import type { NoteWithMeta } from "@/types/window";
import { formatDueLabel, toUiBrowseCard, toUiCard } from "./view-models";

function note(overrides: Partial<NoteWithMeta> = {}): NoteWithMeta {
  const now = new Date("2026-06-07T12:00:00.000Z");
  return {
    id: "note-1",
    deckId: "deck-1",
    type: "basic",
    content: { front: "Prompt", back: "Answer" },
    front: "Prompt",
    back: "Answer",
    state: 1,
    due: now,
    createdAt: now,
    updatedAt: now,
    tags: [],
    locked: false,
    posX: null,
    posY: null,
    ...overrides,
  };
}

describe("view-model helpers", () => {
  it("formats locked, new, due, and future cards", () => {
    const now = new Date("2026-06-07T12:00:00.000Z");

    expect(formatDueLabel(note({ locked: true }), now)).toBe("Locked");
    expect(formatDueLabel(note({ state: 0 }), now)).toBe("New");
    expect(formatDueLabel(note({ due: now }), now)).toBe("Due now");
    expect(
      formatDueLabel(note({ due: new Date("2026-06-07T12:06:00.000Z") }), now),
    ).toBe("in 6m");
    expect(
      formatDueLabel(note({ due: new Date("2026-06-10T12:00:00.000Z") }), now),
    ).toBe("in 3 days");
  });

  it("maps note metadata to UI card shapes", () => {
    const uiCard = toUiCard(
      note({
        state: 2,
        tags: ["typescript"],
      }),
    );

    expect(uiCard).toMatchObject({
      id: "note-1",
      deckId: "deck-1",
      type: "basic",
      state: 2,
      tags: ["typescript"],
    });
  });

  it("preserves deck context for browse cards", () => {
    expect(toUiBrowseCard({ ...note(), deckName: "JavaScript" })).toMatchObject({
      deckName: "JavaScript",
      deckId: "deck-1",
    });
  });
});
