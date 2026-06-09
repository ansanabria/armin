import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createClient } from "@libsql/client";
import { zipSync } from "fflate";
import { closeDb, getDb, initDb, schema, setDbRootForTests } from "../../db";
import { runMigrations } from "../../db/migrate";
import type { ServiceContext } from "../context";
import { analyzeAnkiPackage, commitAnkiImport } from "./import";

// A 1x1 transparent PNG.
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const MODELS = {
  "1": {
    id: 1,
    name: "Basic",
    type: 0,
    flds: [{ name: "Front" }, { name: "Back" }],
    tmpls: [{ qfmt: "{{Front}}", afmt: "{{FrontSide}}<hr>{{Back}}" }],
  },
  "2": {
    id: 2,
    name: "Cloze",
    type: 1,
    flds: [{ name: "Text" }, { name: "Extra" }],
    tmpls: [{ qfmt: "{{cloze:Text}}", afmt: "{{cloze:Text}}<br>{{Extra}}" }],
  },
};

const DECKS = {
  "1": { id: 1, name: "Default" },
  "100": { id: 100, name: "Geography" },
  "200": { id: 200, name: "Science" },
};

const US = "\x1f";

type NoteRow = [number, number, string, string]; // id, mid, tags, flds
type CardRowTuple = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  string,
]; // id, nid, did, ord, type, due, ivl, factor, reps, lapses, data

// A basic card with review scheduling, a basic image card, a basic Science
// card, and a two-deletion cloze note (which Armin skips for now).
const DEFAULT_NOTES: NoteRow[] = [
  [10, 1, "capital europe", `France${US}Paris`],
  [11, 2, "", `The sky is {{c1::blue}} and grass is {{c2::green}}${US}A fact`],
  [12, 1, "", `<img src="flag.png">${US}A flag`],
  [13, 1, "", `H2O${US}Water`],
];
const DEFAULT_CARDS: CardRowTuple[] = [
  [1000, 10, 100, 0, 2, 5, 10, 2500, 3, 1, "{}"], // review card (scheduling)
  [1001, 11, 200, 0, 0, 0, 0, 0, 0, 0, "{}"], // cloze c1 → skipped
  [1002, 11, 200, 1, 0, 0, 0, 0, 0, 0, "{}"], // cloze c2 → skipped
  [1003, 12, 100, 0, 0, 0, 0, 0, 0, 0, "{}"], // image card
  [1004, 13, 200, 0, 0, 0, 0, 0, 0, 0, "{}"], // basic Science card
];

/** Build a minimal legacy-format `.apkg` (collection.anki21 + JSON media). */
async function buildApkg(
  notes: NoteRow[] = DEFAULT_NOTES,
  cards: CardRowTuple[] = DEFAULT_CARDS,
): Promise<Uint8Array> {
  const dbPath = path.join(os.tmpdir(), `armin-anki-src-${randomUUID()}.db`);
  const client = createClient({ url: `file:${dbPath}` });
  await client.execute(
    "CREATE TABLE col (id INTEGER PRIMARY KEY, crt INTEGER, models TEXT, decks TEXT)",
  );
  await client.execute(
    "CREATE TABLE notes (id INTEGER PRIMARY KEY, mid INTEGER, tags TEXT, flds TEXT)",
  );
  await client.execute(
    "CREATE TABLE cards (id INTEGER PRIMARY KEY, nid INTEGER, did INTEGER, ord INTEGER, type INTEGER, due INTEGER, ivl INTEGER, factor INTEGER, reps INTEGER, lapses INTEGER, data TEXT)",
  );
  await client.execute({
    sql: "INSERT INTO col (id, crt, models, decks) VALUES (1, ?, ?, ?)",
    args: [1600000000, JSON.stringify(MODELS), JSON.stringify(DECKS)],
  });

  for (const [id, mid, tags, flds] of notes) {
    await client.execute({
      sql: "INSERT INTO notes (id, mid, tags, flds) VALUES (?, ?, ?, ?)",
      args: [id, mid, tags, flds],
    });
  }
  for (const c of cards) {
    await client.execute({
      sql: "INSERT INTO cards (id, nid, did, ord, type, due, ivl, factor, reps, lapses, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      args: c,
    });
  }
  client.close();

  const dbBytes = new Uint8Array(fs.readFileSync(dbPath));
  fs.unlinkSync(dbPath);

  return zipSync({
    "collection.anki21": dbBytes,
    media: new TextEncoder().encode(JSON.stringify({ "0": "flag.png" })),
    "0": new Uint8Array(Buffer.from(PNG_BASE64, "base64")),
  });
}

let root: string;

async function makeContext(profileId: string): Promise<ServiceContext> {
  await initDb(profileId);
  await runMigrations(profileId);
  return { profileId, db: getDb(profileId) };
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "armin-anki-it-"));
  setDbRootForTests(root);
});

afterEach(() => {
  closeDb();
  setDbRootForTests(null);
  fs.rmSync(root, { recursive: true, force: true });
});

describe("Anki package import", () => {
  it("analyzes basic cards, skips cloze, and reports media/scheduling", async () => {
    const apkg = await buildApkg();
    const analysis = await analyzeAnkiPackage(apkg, "Geo.apkg");

    // 3 basic cards import; the 2 cloze cards are skipped.
    expect(analysis.totalCards).toBe(3);
    expect(analysis.skippedCount).toBe(2);
    expect(analysis.imageCount).toBe(1);
    expect(analysis.hasScheduling).toBe(true);
    expect(analysis.decks.map((d) => d.name).sort()).toEqual([
      "Geography",
      "Science",
    ]);
    expect(analysis.warnings.some((w) => /skipped/i.test(w))).toBe(true);
    expect(analysis.warnings.some((w) => /image/i.test(w))).toBe(true);
    expect(analysis.warnings.some((w) => /imported as fill/i.test(w))).toBe(
      false,
    );
  });

  it("commits basic cards into a single deck with scheduling preserved", async () => {
    const ctx = await makeContext("p1");
    const apkg = await buildApkg();
    const analysis = await analyzeAnkiPackage(apkg, "Geo.apkg");

    const result = await commitAnkiImport(ctx, {
      importId: analysis.importId,
      deckName: "Imported",
      keepScheduling: true,
      deckStrategy: "single",
    });
    expect(result.deckCount).toBe(1);
    expect(result.cardCount).toBe(3);

    const rows = await ctx.db.select().from(schema.cards).all();
    expect(rows).toHaveLength(3);

    // The review card kept its FSRS state (state 2 = Review, reps 3).
    expect(rows.some((c) => c.state === 2 && c.reps === 3)).toBe(true);
    // No cloze card leaked through.
    expect(rows.some((c) => c.front.includes("[...]"))).toBe(false);
    // The image was inlined as a data URL.
    expect(rows.some((c) => c.back.includes("data:image/png;base64"))).toBe(
      true,
    );

    const tags = await ctx.db.select().from(schema.tags).all();
    expect(tags.map((t) => t.name).sort()).toEqual(["capital", "europe"]);
  });

  it("keeps Anki decks separate when asked", async () => {
    const ctx = await makeContext("p2");
    const apkg = await buildApkg();
    const analysis = await analyzeAnkiPackage(apkg, "Geo.apkg");

    const result = await commitAnkiImport(ctx, {
      importId: analysis.importId,
      deckName: "ignored",
      keepScheduling: false,
      deckStrategy: "separate",
    });
    expect(result.deckCount).toBe(2);

    const decks = await ctx.db.select().from(schema.decks).all();
    expect(decks.map((d) => d.name).sort()).toEqual(["Geography", "Science"]);

    // keepScheduling=false → every card is a fresh New card.
    const cards = await ctx.db.select().from(schema.cards).all();
    expect(cards.every((c) => c.state === 0 && c.reps === 0)).toBe(true);
  });

  it("rejects a package that has only unsupported (cloze) cards", async () => {
    const apkg = await buildApkg(
      [[20, 2, "", `Only {{c1::cloze}} here${US}extra`]],
      [[2000, 20, 200, 0, 0, 0, 0, 0, 0, 0, "{}"]],
    );
    await expect(analyzeAnkiPackage(apkg, "Cloze.apkg")).rejects.toThrow(
      /basic front\/back/i,
    );
  });

  it("rejects a commit with an unknown import id", async () => {
    const ctx = await makeContext("p3");
    await expect(
      commitAnkiImport(ctx, {
        importId: "does-not-exist",
        deckName: "X",
        keepScheduling: false,
        deckStrategy: "single",
      }),
    ).rejects.toThrow(/expired/i);
  });
});
