import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { count, eq } from "drizzle-orm";
import { strToU8, zipSync } from "fflate";

const userData = vi.hoisted(() => {
  let dir = "";
  return {
    get: () => dir,
    set: (next: string) => {
      dir = next;
    },
  };
});

vi.mock("electron", () => ({
  app: {
    getPath: (name: string) => {
      if (name === "userData") return userData.get();
      throw new Error(`Unexpected getPath: ${name}`);
    },
    getVersion: () => "0.0.0-test",
  },
}));

import { closeDb, getDb, initDb, schema, setDbRootForTests } from "../db";
import { runMigrations } from "../db/migrate";
import { getLocalSchemaVersion } from "../db/schema-version";
import type { ServiceContext } from "./context";
import * as decks from "./decks";
import * as flashcards from "./flashcards";
import * as graph from "./graph";
import * as review from "./review";
import { listProfiles } from "./profiles";
import { exportProfileToMarkdownZip } from "./export";
import { restoreProfileFromZip } from "./restore";

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "armin-restore-"));
  setDbRootForTests(root);
  userData.set(root);
});

afterEach(() => {
  closeDb();
  setDbRootForTests(null);
  userData.set("");
  fs.rmSync(root, { recursive: true, force: true });
});

async function makeCtx(profileId: string): Promise<ServiceContext> {
  await initDb(profileId);
  await runMigrations(profileId);
  return { profileId, db: getDb(profileId) };
}

function tableCount(
  ctx: ServiceContext,
  table:
    | typeof schema.decks
    | typeof schema.flashcards
    | typeof schema.flashcardPrereqs
    | typeof schema.reviewLogs,
): number {
  return ctx.db.select({ v: count() }).from(table).get()?.v ?? 0;
}

describe("restoreProfileFromZip", () => {
  it("round-trips a profile losslessly into a new profile", async () => {
    const source = await makeCtx("restore-source");
    const deck = await decks.createDeck(source, { name: "Calculus" });
    const limit = await flashcards.createFlashcard({
      ctx: source,
      deckId: deck.id,
      type: "basic",
      content: { front: "What is a limit?", back: "..." },
      tags: ["math"],
    });
    const derivative = await flashcards.createFlashcard({
      ctx: source,
      deckId: deck.id,
      type: "basic",
      content: { front: "What is a derivative?", back: "..." },
    });
    await graph.addPrereq(source, limit.id, derivative.id);

    // Review the (unlocked) prereq so there is a review log to preserve.
    const unit = source.db
      .select()
      .from(schema.reviewUnits)
      .where(eq(schema.reviewUnits.flashcardId, limit.id))
      .get();
    await review.rateReviewUnit(source, unit!.id, 3);

    const expected = {
      decks: tableCount(source, schema.decks),
      flashcards: tableCount(source, schema.flashcards),
      prereqs: tableCount(source, schema.flashcardPrereqs),
      reviewLogs: tableCount(source, schema.reviewLogs),
    };
    expect(expected.reviewLogs).toBeGreaterThan(0);

    const { bytes } = await exportProfileToMarkdownZip(source, "Calc Profile");

    const result = await restoreProfileFromZip(bytes);
    expect(result.profile.name).toBe("Restored: Calc Profile");
    expect(listProfiles().map((p) => p.id)).toContain(result.profile.id);

    const restored: ServiceContext = {
      profileId: result.profile.id,
      db: getDb(result.profile.id),
    };
    expect({
      decks: tableCount(restored, schema.decks),
      flashcards: tableCount(restored, schema.flashcards),
      prereqs: tableCount(restored, schema.flashcardPrereqs),
      reviewLogs: tableCount(restored, schema.reviewLogs),
    }).toEqual(expected);

    const restoredDecks = restored.db.select().from(schema.decks).all();
    expect(restoredDecks[0].name).toBe("Calculus");
  });


  it("refuses a backup from a newer schema version", async () => {
    const newer = getLocalSchemaVersion() + 1;
    const zip = zipSync({
      "manifest.json": strToU8(
        JSON.stringify({
          format: "armin-backup",
          formatVersion: 1,
          schemaVersion: newer,
          profileName: "X",
        }),
      ),
      "armin.db": new Uint8Array([1, 2, 3]),
    });
    await expect(restoreProfileFromZip(zip)).rejects.toThrow(
      /newer version of Armin/,
    );
    expect(listProfiles()).toEqual([]);
  });

  it("rejects a zip that isn't an Armin backup", async () => {
    const zip = zipSync({ "notes.txt": strToU8("hello") });
    await expect(restoreProfileFromZip(zip)).rejects.toThrow(
      /isn't an Armin backup/,
    );
    expect(listProfiles()).toEqual([]);
  });
});
