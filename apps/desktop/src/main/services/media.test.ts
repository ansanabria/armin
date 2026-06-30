import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { profileMediaDir } from "../db";
import { makeContext, useTestDb } from "../test/db";
import * as decks from "./decks";
import * as flashcards from "./flashcards";
import {
  mediaFileNameFromRef,
  storeFlashcardMedia,
} from "./media";

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
});
