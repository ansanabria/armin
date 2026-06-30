import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { zipSync } from "fflate";
import {
  closeDb,
  profileMediaDir,
  schema,
  setDbRootForTests,
} from "../../db";
import { ensureProfileReady, resetProfileRuntime } from "../../profiles/runtime";
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
  "6": {
    id: 6,
    name: "Custom Q/A",
    type: 0,
    flds: [{ name: "Question" }, { name: "Answer" }],
    tmpls: [{ qfmt: "{{Question}}", afmt: "{{FrontSide}}<hr>{{Answer}}" }],
  },
  "7": {
    id: 7,
    name: "Image Occlusion",
    type: 1,
    flds: [
      { name: "Occlusions" },
      { name: "Image" },
      { name: "Header" },
      { name: "Back Extra" },
      { name: "Comments" },
    ],
    tmpls: [
      {
        qfmt: "{{cloze:Occlusions}}<br>{{Image}}",
        afmt: "{{cloze:Occlusions}}<br>{{Image}}<hr>{{Back Extra}}",
      },
    ],
  },
  "8": {
    id: 8,
    name: "Image Occlusion Enhanced",
    type: 0,
    flds: [
      { name: "Question Mask" },
      { name: "Answer Mask" },
      { name: "Original Mask" },
      { name: "Original Image" },
      { name: "Header" },
      { name: "Footer" },
      { name: "Remarks" },
      { name: "Sources" },
      { name: "ID" },
    ],
    tmpls: [{ qfmt: "{{Question Mask}}", afmt: "{{Answer Mask}}" }],
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
// card, a basic Science card, a reversed note, a type-answer note, and an
// image occlusion note.
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
  [1008, 16, 100, 0, 0, 0, 0, 0, 0, 0, "{}"], // image occlusion mask 1
  [1009, 16, 100, 1, 0, 0, 0, 0, 0, 0, "{}"], // image occlusion mask 2
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
  return ensureProfileReady(profileId);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "armin-anki-it-"));
  setDbRootForTests(root);
});

afterEach(() => {
  closeDb();
  resetProfileRuntime();
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

    const rows = ctx.db.select().from(schema.reviewUnits).all();
    expect(rows).toHaveLength(10);

    // The review card kept its FSRS state (state 2 = Review, reps 3).
    expect(rows.some((c) => c.state === 2 && c.reps === 3)).toBe(true);
    expect(rows.some((c) => c.subKey === "c1" && c.front.includes("[…]"))).toBe(
      true,
    );
    // The imported image was stored as Flashcard media before persistence.
    expect(rows.some((c) => c.back.includes("armin-media:"))).toBe(
      true,
    );
    expect(fs.readdirSync(profileMediaDir(ctx.profileId))).toHaveLength(1);

    const tags = ctx.db.select().from(schema.tags).all();
    expect(tags.map((t) => t.name).sort()).toEqual(["capital", "europe"]);

    const notes = ctx.db.select().from(schema.flashcards).all();
    expect(notes.map((n) => n.type).sort()).toEqual([
      "basic",
      "basic",
      "basic",
      "basic_reversed",
      "cloze",
      "image_occlusion",
      "type_answer",
    ]);
  });

  it("reports an unmappable note type instead of coercing it to basic", async () => {
    const ctx = await makeContext("p3");
    const apkg = await buildApkg(
      [...DEFAULT_NOTES, [17, 6, "", `Question text${US}Answer text`]],
      [...DEFAULT_CARDS, [1010, 17, 100, 0, 0, 0, 0, 0, 0, 0, "{}"]],
    );

    const analysis = await analyzeAnkiPackage(apkg, "Mixed.apkg");

    expect(analysis.totalCards).toBe(10);
    expect(analysis.importedTypes).toEqual([
      { type: "basic", count: 3 },
      { type: "basic_reversed", count: 2 },
      { type: "cloze", count: 2 },
      { type: "image_occlusion", count: 2 },
      { type: "type_answer", count: 1 },
    ]);
    expect(analysis.skippedCount).toBe(1);
    expect(analysis.skippedNotes).toEqual([
      {
        noteId: 17,
        noteType: "Custom Q/A",
        cardCount: 1,
        reason: "Anki note type does not map to a supported Armin flashcard type.",
      },
    ]);

    const result = await commitAnkiImport(ctx, {
      importId: analysis.importId,
      deckName: "Imported",
      keepScheduling: false,
      deckStrategy: "single",
    });

    expect(result.cardCount).toBe(10);
    expect(result.skippedCount).toBe(1);
    expect(result.skippedNotes).toEqual(analysis.skippedNotes);

    const notes = ctx.db.select().from(schema.flashcards).all();
    expect(notes).toHaveLength(7);
    expect(notes.filter((n) => n.type === "basic")).toHaveLength(3);
  });

  it("imports native Anki image occlusion masks with per-mask scheduling", async () => {
    const ctx = await makeContext("p4");
    const occlusions = [
      "{{c1::image-occlusion:rect:left=0.1:top=0.2:width=0.3:height=0.4}}",
      "{{c2::image-occlusion:ellipse:left=0.5:top=0.6:width=0.2:height=0.1}}",
    ].join(" ");
    const apkg = await buildApkg(
      [
        [
          18,
          7,
          "io",
          `${occlusions}${US}<img src="flag.png">${US}Anatomy${US}Back notes${US}Comment notes`,
        ],
      ],
      [
        [1011, 18, 100, 0, 0, 0, 0, 0, 0, 0, "{}"],
        [1012, 18, 100, 1, 2, 5, 12, 2600, 4, 1, '{"s":7,"d":4}'],
      ],
    );

    const analysis = await analyzeAnkiPackage(apkg, "Native IO.apkg");
    expect(analysis.totalCards).toBe(2);
    expect(analysis.importedTypes).toEqual([
      { type: "image_occlusion", count: 2 },
    ]);
    expect(analysis.skippedCount).toBe(0);

    await commitAnkiImport(ctx, {
      importId: analysis.importId,
      deckName: "Imported",
      keepScheduling: true,
      deckStrategy: "single",
    });

    const [flashcard] = ctx.db.select().from(schema.flashcards).all();
    expect(flashcard.type).toBe("image_occlusion");
    const content = JSON.parse(flashcard.content) as {
      baseImage: string;
      masks: { id: string; geometry: { x: number; y: number; w: number; h: number } }[];
      header: string;
      extra: string;
      revealMode: string;
    };
    expect(content.baseImage).toMatch(/^armin-media:[a-f0-9]{64}\.png$/);
    expect(fs.readdirSync(profileMediaDir(ctx.profileId))).toHaveLength(1);
    expect(content.revealMode).toBe("hide_one");
    expect(content.header).toBe("Anatomy");
    expect(content.extra).toBe("Back notes\n\nComment notes");
    expect(content.masks.map((mask) => mask.id)).toEqual(["c1", "c2"]);
    expect(content.masks[0].geometry).toMatchObject({ x: 0.1, y: 0.2 });
    expect(content.masks[0].geometry.w).toBeCloseTo(0.3);
    expect(content.masks[0].geometry.h).toBeCloseTo(0.4);
    expect(content.masks[1].geometry).toMatchObject({ x: 0.5, y: 0.6 });
    expect(content.masks[1].geometry.w).toBeCloseTo(0.2);
    expect(content.masks[1].geometry.h).toBeCloseTo(0.1);

    const rows = ctx.db.select().from(schema.reviewUnits).all();
    expect(rows.map((row) => row.subKey).sort()).toEqual(["c1", "c2"]);
    expect(rows.find((row) => row.subKey === "c2")).toMatchObject({
      state: 2,
      reps: 4,
      lapses: 1,
      stability: 7,
      difficulty: 4,
    });
  });

});
