import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
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
  "3": {
    id: 3,
    name: "Basic (and reversed card)",
    type: 0,
    flds: [{ name: "Front" }, { name: "Back" }],
    tmpls: [
      { qfmt: "{{Front}}", afmt: "{{FrontSide}}<hr>{{Back}}" },
      { qfmt: "{{Back}}", afmt: "{{FrontSide}}<hr>{{Front}}" },
    ],
  },
  "4": {
    id: 4,
    name: "Basic (type in the answer)",
    type: 0,
    flds: [{ name: "Front" }, { name: "Back" }],
    tmpls: [
      { qfmt: "{{Front}}<br>{{type:Back}}", afmt: "{{FrontSide}}<hr>{{Back}}" },
    ],
  },
  "5": {
    id: 5,
    name: "Diagram",
    type: 0,
    flds: [{ name: "Image" }, { name: "Regions" }],
    tmpls: [{ qfmt: "{{Image}}", afmt: "{{Image}}<hr>{{Regions}}" }],
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

// A basic card with review scheduling, a two-deletion cloze note, a basic image
// card, a basic Science card, a reversed note, a type-answer note, and a
// diagram note.
const DEFAULT_NOTES: NoteRow[] = [
  [10, 1, "capital europe", `France${US}Paris`],
  [11, 2, "", `The sky is {{c1::blue}} and grass is {{c2::green}}${US}A fact`],
  [12, 1, "", `<img src="flag.png">${US}A flag`],
  [13, 1, "", `H2O${US}Water`],
  [14, 3, "", `Germany${US}Berlin`],
  [15, 4, "", `Largest planet${US}Jupiter`],
  [
    16,
    5,
    "",
    `<img src="flag.png">${US}${JSON.stringify([
      { id: "r1", x: 0, y: 0, w: 10, h: 10, label: "Top" },
      { id: "r2", x: 10, y: 10, w: 10, h: 10, label: "Bottom" },
    ])}`,
  ],
];
const DEFAULT_CARDS: CardRowTuple[] = [
  [1000, 10, 100, 0, 2, 5, 10, 2500, 3, 1, "{}"], // review card (scheduling)
  [1001, 11, 200, 0, 0, 0, 0, 0, 0, 0, "{}"], // cloze c1
  [1002, 11, 200, 1, 0, 0, 0, 0, 0, 0, "{}"], // cloze c2
  [1003, 12, 100, 0, 0, 0, 0, 0, 0, 0, "{}"], // image card
  [1004, 13, 200, 0, 0, 0, 0, 0, 0, 0, "{}"], // basic Science card
  [1005, 14, 100, 0, 0, 0, 0, 0, 0, 0, "{}"], // reversed forward
  [1006, 14, 100, 1, 0, 0, 0, 0, 0, 0, "{}"], // reversed reverse
  [1007, 15, 200, 0, 0, 0, 0, 0, 0, 0, "{}"], // type answer
  [1008, 16, 100, 0, 0, 0, 0, 0, 0, 0, "{}"], // diagram region 1
  [1009, 16, 100, 1, 0, 0, 0, 0, 0, 0, "{}"], // diagram region 2
];

/** Build a minimal legacy-format `.apkg` (collection.anki21 + JSON media). */
async function buildApkg(
  notes: NoteRow[] = DEFAULT_NOTES,
  cards: CardRowTuple[] = DEFAULT_CARDS,
): Promise<Uint8Array> {
  const dbPath = path.join(os.tmpdir(), `armin-anki-src-${randomUUID()}.db`);
  const client = new Database(dbPath);
  client.exec(
    "CREATE TABLE col (id INTEGER PRIMARY KEY, crt INTEGER, models TEXT, decks TEXT)",
  );
  client.exec(
    "CREATE TABLE notes (id INTEGER PRIMARY KEY, mid INTEGER, tags TEXT, flds TEXT)",
  );
  client.exec(
    "CREATE TABLE cards (id INTEGER PRIMARY KEY, nid INTEGER, did INTEGER, ord INTEGER, type INTEGER, due INTEGER, ivl INTEGER, factor INTEGER, reps INTEGER, lapses INTEGER, data TEXT)",
  );
  client
    .prepare("INSERT INTO col (id, crt, models, decks) VALUES (1, ?, ?, ?)")
    .run(1600000000, JSON.stringify(MODELS), JSON.stringify(DECKS));

  const insertNote = client.prepare(
    "INSERT INTO notes (id, mid, tags, flds) VALUES (?, ?, ?, ?)",
  );
  for (const [id, mid, tags, flds] of notes) {
    insertNote.run(id, mid, tags, flds);
  }
  const insertCard = client.prepare(
    "INSERT INTO cards (id, nid, did, ord, type, due, ivl, factor, reps, lapses, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  for (const c of cards) {
    insertCard.run(...c);
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
  it("analyzes supported card types and reports media/scheduling", async () => {
    const apkg = await buildApkg();
    const analysis = await analyzeAnkiPackage(apkg, "Geo.apkg");

    expect(analysis.totalCards).toBe(10);
    expect(analysis.skippedCount).toBe(0);
    expect(analysis.imageCount).toBe(1);
    expect(analysis.hasScheduling).toBe(true);
    expect(analysis.decks.map((d) => d.name).sort()).toEqual([
      "Geography",
      "Science",
    ]);
    expect(analysis.warnings.some((w) => /skipped/i.test(w))).toBe(false);
    expect(analysis.warnings.some((w) => /image/i.test(w))).toBe(true);
    expect(analysis.warnings.some((w) => /imported as fill/i.test(w))).toBe(
      false,
    );
  });

  it("commits supported card types into a single deck with scheduling preserved", async () => {
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
    expect(result.cardCount).toBe(10);

    const rows = await ctx.db.select().from(schema.cards).all();
    expect(rows).toHaveLength(10);

    // The review card kept its FSRS state (state 2 = Review, reps 3).
    expect(rows.some((c) => c.state === 2 && c.reps === 3)).toBe(true);
    expect(rows.some((c) => c.subKey === "c1" && c.front.includes("[…]"))).toBe(
      true,
    );
    // The image was inlined as a data URL.
    expect(rows.some((c) => c.back.includes("data:image/png;base64"))).toBe(
      true,
    );

    const tags = await ctx.db.select().from(schema.tags).all();
    expect(tags.map((t) => t.name).sort()).toEqual(["capital", "europe"]);

    const notes = await ctx.db.select().from(schema.notes).all();
    expect(notes.map((n) => n.type).sort()).toEqual([
      "basic",
      "basic",
      "basic",
      "basic_reversed",
      "cloze",
      "diagram",
      "type_answer",
    ]);
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
});
