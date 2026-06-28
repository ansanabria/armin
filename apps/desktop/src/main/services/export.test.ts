import { unzipSync, strFromU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { makeContext, useTestDb } from "../test/db";
import * as decks from "./decks";
import * as flashcards from "./flashcards";
import * as graph from "./graph";
import { exportProfileToMarkdownZip } from "./export";
import { storeFlashcardMedia } from "./media";

useTestDb();

function unzip(bytes: Uint8Array): Record<string, string> {
  const files = unzipSync(bytes);
  const out: Record<string, string> = {};
  for (const [name, data] of Object.entries(files)) {
    out[name] = strFromU8(data);
  }
  return out;
}

describe("exportProfileToMarkdownZip", () => {
  it("writes a README index and one Markdown file per deck", async () => {
    const ctx = await makeContext("export-basic");
    const deckA = await decks.createDeck(ctx, {
      name: "Algebra",
      description: "Starter deck",
    });
    await decks.createDeck(ctx, { name: "Geometry" });
    await flashcards.createFlashcard({
      ctx,
      deckId: deckA.id,
      type: "basic",
      content: { front: "2 + 2", back: "4" },
      tags: ["math", "easy"],
    });

    const now = new Date("2026-06-20T12:00:00.000Z");
    const result = await exportProfileToMarkdownZip(ctx, "My Profile", now);

    expect(result.deckCount).toBe(2);
    expect(result.flashcardCount).toBe(1);
    expect(result.fileName).toBe("Armin-my-profile-2026-06-20.zip");

    const files = unzip(result.bytes);
    expect(Object.keys(files).sort()).toEqual([
      "README.md",
      "armin.db",
      "library/README.md",
      "library/decks/algebra.md",
      "library/decks/geometry.md",
      "manifest.json",
    ]);
    expect(files["library/README.md"]).toContain("My Profile — Armin export");
    expect(files["library/README.md"]).toContain("[Algebra](decks/algebra.md)");

    const manifest = JSON.parse(files["manifest.json"]);
    expect(manifest).toMatchObject({
      format: "armin-backup",
      formatVersion: 2,
      profileName: "My Profile",
      deckCount: 2,
      flashcardCount: 1,
    });
    expect(manifest.schemaVersion).toBeGreaterThan(0);

    // The SQLite snapshot starts with the standard file header.
    expect(files["armin.db"].startsWith("SQLite format 3")).toBe(true);

    const algebra = files["library/decks/algebra.md"];
    expect(algebra).toContain("# Algebra");
    expect(algebra).toContain("Starter deck");
    expect(algebra).toContain("2 + 2");
    expect(algebra).toContain("**Back**");
    expect(algebra).toContain("4");
    expect(algebra).toContain("**Tags:** easy, math");
    expect(algebra).toContain("**Scheduling**");
    expect(algebra).toContain("New");
  });

  it("records prerequisites by a cross-deck reference", async () => {
    const ctx = await makeContext("export-prereqs");
    const deck = await decks.createDeck(ctx, { name: "Calculus" });
    const prereq = await flashcards.createFlashcard({
      ctx,
      deckId: deck.id,
      type: "basic",
      content: { front: "What is a limit?", back: "..." },
    });
    const dependent = await flashcards.createFlashcard({
      ctx,
      deckId: deck.id,
      type: "basic",
      content: { front: "What is a derivative?", back: "..." },
    });
    await graph.addPrereq(ctx, prereq.id, dependent.id);

    const files = unzip(
      (await exportProfileToMarkdownZip(ctx, "P", new Date())).bytes,
    );
    expect(files["library/decks/calculus.md"]).toContain("**Prerequisites:**");
    expect(files["library/decks/calculus.md"]).toContain(
      "Calculus › What is a limit?",
    );
  });

  it("gives colliding deck names distinct filenames", async () => {
    const ctx = await makeContext("export-collide");
    await decks.createDeck(ctx, { name: "My Deck" });
    await decks.createDeck(ctx, { name: "My Deck" });

    const files = unzip(
      (await exportProfileToMarkdownZip(ctx, "P", new Date())).bytes,
    );
    const deckFiles = Object.keys(files)
      .filter((name) => name.startsWith("library/decks/"))
      .sort();
    expect(deckFiles).toEqual([
      "library/decks/my-deck-2.md",
      "library/decks/my-deck.md",
    ]);
  });

  it("includes Flashcard media and rewrites readable Markdown links", async () => {
    const ctx = await makeContext("export-media");
    const deck = await decks.createDeck(ctx, { name: "Biology" });
    const media = storeFlashcardMedia({
      profileId: ctx.profileId,
      bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00]),
      fileName: "cell.png",
      mime: "image/png",
    });
    await flashcards.createFlashcard({
      ctx,
      deckId: deck.id,
      type: "basic",
      content: { front: `![cell](${media.ref})`, back: "Cell" },
    });

    const rawFiles = unzipSync(
      (await exportProfileToMarkdownZip(ctx, "P", new Date())).bytes,
    );
    expect(rawFiles[`media/${media.fileName}`]).toBeDefined();

    expect(strFromU8(rawFiles["library/decks/biology.md"])).toContain(
      `![cell](../../media/${media.fileName})`,
    );
  });
});
