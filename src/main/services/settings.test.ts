import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { schema } from "../db";
import { makeContext, useTestDb } from "../test/db";
import * as decks from "./decks";
import * as settings from "./settings";

useTestDb();

describe("deck settings", () => {
  it("inherits global scheduling settings until an override is saved", async () => {
    const ctx = await makeContext("deck-settings-inherit");
    await settings.updateSettings(ctx, {
      requestRetention: 0.85,
      newReviewUnitsPerDay: 7,
    });
    const deck = await decks.createDeck(ctx, { name: "Inherited" });

    const result = await settings.getDeckSettings(ctx, deck.id);

    expect(result.effective.requestRetention).toBe(0.85);
    expect(result.effective.newReviewUnitsPerDay).toBe(7);
  });

  it("applies individual overrides and clears them back to inheritance", async () => {
    const ctx = await makeContext("deck-settings-override");
    await settings.updateSettings(ctx, { requestRetention: 0.9 });
    const deck = await decks.createDeck(ctx, { name: "Overrides" });

    let result = await settings.updateDeckSettings(ctx, deck.id, {
      requestRetention: 0.8,
    });

    expect(result.overrides.requestRetention).toBe(0.8);
    expect(result.effective.requestRetention).toBe(0.8);

    await settings.updateSettings(ctx, { requestRetention: 0.85 });
    result = await settings.updateDeckSettings(ctx, deck.id, {
      requestRetention: null,
    });

    expect(result.overrides.requestRetention).toBeNull();
    expect(result.effective.requestRetention).toBe(0.85);
  });

  it("does not create a row for new decks until settings are saved", async () => {
    const ctx = await makeContext("deck-settings-row");
    const deck = await decks.createDeck(ctx, { name: "No row" });

    let rows = await ctx.db
      .select()
      .from(schema.deckSettings)
      .where(eq(schema.deckSettings.deckId, deck.id))
      .all();
    expect(rows).toHaveLength(0);

    await settings.updateDeckSettings(ctx, deck.id, { requestRetention: 0.8 });
    rows = await ctx.db
      .select()
      .from(schema.deckSettings)
      .where(eq(schema.deckSettings.deckId, deck.id))
      .all();
    expect(rows).toHaveLength(1);
  });

  it("deletes deck settings when the deck is deleted", async () => {
    const ctx = await makeContext("deck-settings-cascade");
    const deck = await decks.createDeck(ctx, { name: "Cascade" });
    await settings.updateDeckSettings(ctx, deck.id, { requestRetention: 0.8 });

    await decks.deleteDeck(ctx, deck.id);

    const rows = await ctx.db
      .select()
      .from(schema.deckSettings)
      .where(eq(schema.deckSettings.deckId, deck.id))
      .all();
    expect(rows).toHaveLength(0);
  });
});
