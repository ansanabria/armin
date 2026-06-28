import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { schema, profileMediaDir } from "../db";
import { makeContext, useTestDb } from "../test/db";
import * as decks from "./decks";
import * as flashcards from "./flashcards";
import {
  mediaFileNameFromRef,
  storeFlashcardMedia,
  upgradeLegacyFlashcardMedia,
} from "./media";
import { parseStoredContent } from "./flashcard-types";

useTestDb();

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00]);
const PNG_DATA_URL = `data:image/png;base64,${Buffer.from(PNG_BYTES).toString(
  "base64",
)}`;

describe("Flashcard media", () => {
  it("stores image bytes as content-addressed profile media", async () => {
    const ctx = await makeContext("media-store");

    const first = storeFlashcardMedia({
      profileId: ctx.profileId,
      bytes: PNG_BYTES,
      fileName: "diagram.png",
      mime: "image/png",
    });
    const second = storeFlashcardMedia({
      profileId: ctx.profileId,
      bytes: PNG_BYTES,
      fileName: "copy.png",
      mime: "image/png",
    });

    expect(first.ref).toBe(second.ref);
    expect(first.ref).toMatch(/^armin-media:[a-f0-9]{64}\.png$/);
    expect(
      fs.existsSync(
        path.join(profileMediaDir(ctx.profileId), mediaFileNameFromRef(first.ref)),
      ),
    ).toBe(true);
  });

  it("rejects flashcard image data URLs at the write boundary", async () => {
    const ctx = await makeContext("media-reject");
    const deck = await decks.createDeck(ctx, { name: "Images" });

    await expect(
      flashcards.createFlashcard({
        ctx,
        deckId: deck.id,
        type: "basic",
        content: { front: `![x](${PNG_DATA_URL})`, back: "Back" },
      }),
    ).rejects.toThrow(/Flashcard media/);
  });

  it("upgrades legacy data URLs into media references", async () => {
    const ctx = await makeContext("media-upgrade");
    const deck = await decks.createDeck(ctx, { name: "Legacy" });
    const oldContent = {
      front: `See ![diagram](${PNG_DATA_URL})`,
      back: "Answer",
    };
    const [row] = ctx.db
      .insert(schema.flashcards)
      .values({
        deckId: deck.id,
        type: "basic",
        content: JSON.stringify(oldContent),
      })
      .returning()
      .all();

    await upgradeLegacyFlashcardMedia(ctx);

    const migrated = ctx.db
      .select()
      .from(schema.flashcards)
      .where(eq(schema.flashcards.id, row.id))
      .get();
    const parsed = parseStoredContent(migrated!.type, migrated!.content);
    expect(JSON.stringify(parsed.content)).toContain("armin-media:");
    expect(JSON.stringify(parsed.content)).not.toContain("data:image/");
    expect(fs.readdirSync(profileMediaDir(ctx.profileId))).toHaveLength(1);
  });
});
