/**
 * Read an Anki `.apkg`/`.colpkg` package and turn it into Armin decks + cards.
 *
 * The flow is two-phase so the UI can show the user what they're about to
 * import and prompt for follow-up choices:
 *
 *   1. `analyzeAnkiPackage(bytes)` unzips the package, reads the embedded
 *      SQLite collection, renders every note into Markdown front/back cards and
 *      returns a small summary (plus a cached parse keyed by `importId`).
 *   2. `commitAnkiImport(ctx, …)` writes the cached cards into the database,
 *      honouring the user's deck-name, multi-deck and keep-scheduling choices.
 *
 * `.apkg` containers come in three flavours we handle:
 *   - `collection.anki2`   — legacy SQLite (schema 11), JSON note types/decks.
 *   - `collection.anki21`  — newer SQLite, still schema 11 + JSON.
 *   - `collection.anki21b` — schema 18, zstd-compressed, note types/decks in
 *     protobuf tables. We fall back to a field-based extraction here.
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { unzipSync } from "fflate";
import { decompress as zstdDecompress } from "fzstd";
import { schema } from "../../db";
import type { ServiceContext } from "../context";
import { newCardFields, type FsrsFields } from "../scheduler";
import { ankiHtmlToMarkdown } from "./html";
import { hasClozeMarkers, renderTemplate } from "./template";

const FIELD_SEPARATOR = "\x1f";
const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd];

// --- types shared with the renderer ------------------------------------------

/** A single card ready to be written to Armin. */
type ParsedCard = {
  front: string;
  back: string;
  tags: string[];
  /** Original Anki deck name (may be hierarchical, e.g. "Parent::Child"). */
  deckName: string;
  /** Best-effort FSRS scheduling carried over from Anki, when available. */
  schedule: FsrsFields | null;
};

type ParsedPackage = {
  cards: ParsedCard[];
  decks: { name: string; cardCount: number }[];
  imageCount: number;
  hasScheduling: boolean;
  warnings: string[];
};

/** The serializable summary returned to the renderer after analysis. */
export type AnkiAnalysis = {
  importId: string;
  suggestedName: string;
  totalCards: number;
  /** Cards left out because they aren't basic front/back (e.g. cloze). */
  skippedCount: number;
  decks: { name: string; cardCount: number }[];
  imageCount: number;
  hasScheduling: boolean;
  warnings: string[];
};

export type AnkiImportResult = {
  deckCount: number;
  cardCount: number;
  firstDeckId: string | null;
};

// --- internal collection model -----------------------------------------------

type NoteType = {
  id: number;
  name: string;
  isCloze: boolean;
  fieldNames: string[];
  /** qfmt/afmt by ordinal; null when unavailable (schema 18). */
  templates: { qfmt: string; afmt: string }[] | null;
};

type Note = { mid: number; tags: string[]; fields: string[] };

// --- parse cache -------------------------------------------------------------

const parseCache = new Map<string, { pkg: ParsedPackage; at: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000;

function rememberParse(pkg: ParsedPackage): string {
  const importId = randomUUID();
  const now = Date.now();
  for (const [key, value] of parseCache) {
    if (now - value.at > CACHE_TTL_MS) parseCache.delete(key);
  }
  parseCache.set(importId, { pkg, at: now });
  return importId;
}

// --- zip / compression helpers -----------------------------------------------

function looksZstd(bytes: Uint8Array): boolean {
  return ZSTD_MAGIC.every((b, i) => bytes[i] === b);
}

function maybeDecompress(bytes: Uint8Array): Uint8Array {
  return looksZstd(bytes) ? zstdDecompress(bytes) : bytes;
}

/** Decode the new-format protobuf `MediaEntries` into filenames by index. */
function decodeMediaEntries(bytes: Uint8Array): string[] {
  const names: string[] = [];
  let i = 0;
  const readVarint = (): number => {
    let shift = 0;
    let result = 0;
    while (i < bytes.length) {
      const b = bytes[i++];
      result |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) break;
      shift += 7;
    }
    return result >>> 0;
  };
  while (i < bytes.length) {
    const tag = readVarint();
    const wire = tag & 0x7;
    if (wire !== 2) break; // expect a length-delimited MediaEntry
    const len = readVarint();
    const end = i + len;
    // Within the entry, field 1 (wire 2) is the filename string.
    let name = "";
    while (i < end) {
      const innerTag = readVarint();
      const innerWire = innerTag & 0x7;
      if (innerWire === 2) {
        const innerLen = readVarint();
        const slice = bytes.subarray(i, i + innerLen);
        i += innerLen;
        if (innerTag >> 3 === 1) name = Buffer.from(slice).toString("utf8");
      } else if (innerWire === 0) {
        readVarint();
      } else {
        i = end;
        break;
      }
    }
    names.push(name);
    i = end;
  }
  return names;
}

const IMAGE_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  avif: "image/avif",
};

function imageMime(filename: string): string | undefined {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_MIME[ext];
}

/** Build a `filename → data:` URL map for the package's image media. */
function buildMediaMap(entries: Record<string, Uint8Array>): {
  byName: Map<string, string>;
  imageCount: number;
} {
  const byName = new Map<string, string>();
  const mediaEntry = entries["media"];
  if (!mediaEntry) return { byName, imageCount: 0 };

  let indexToName: Record<string, string> = {};
  try {
    indexToName = JSON.parse(Buffer.from(mediaEntry).toString("utf8"));
  } catch {
    // New format: protobuf list, index = position.
    decodeMediaEntries(mediaEntry).forEach((name, idx) => {
      indexToName[String(idx)] = name;
    });
  }

  let imageCount = 0;
  for (const [index, name] of Object.entries(indexToName)) {
    const mime = imageMime(name);
    if (!mime) continue; // skip audio/video and other non-images
    const raw = entries[index];
    if (!raw) continue;
    const bytes = maybeDecompress(raw);
    const dataUrl = `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
    byName.set(name, dataUrl);
    imageCount++;
  }
  return { byName, imageCount };
}

// --- collection reading ------------------------------------------------------

function chooseCollection(entries: Record<string, Uint8Array>): {
  bytes: Uint8Array;
  schema18: boolean;
} {
  if (entries["collection.anki21b"]) {
    return {
      bytes: maybeDecompress(entries["collection.anki21b"]),
      schema18: true,
    };
  }
  if (entries["collection.anki21"]) {
    return { bytes: entries["collection.anki21"], schema18: false };
  }
  if (entries["collection.anki2"]) {
    return { bytes: entries["collection.anki2"], schema18: false };
  }
  throw new Error("No Anki collection found in this package.");
}

async function openTempDb(
  bytes: Uint8Array,
): Promise<{ client: Client; cleanup: () => void }> {
  const tmpPath = path.join(os.tmpdir(), `armin-anki-${randomUUID()}.db`);
  fs.writeFileSync(tmpPath, Buffer.from(bytes));
  const client = createClient({ url: `file:${tmpPath}` });
  return {
    client,
    cleanup: () => {
      client.close();
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        /* best effort */
      }
    },
  };
}

type ColMeta = {
  crt: number;
  noteTypes: Map<number, NoteType>;
  deckNames: Map<number, string>;
};

async function readColMeta(
  client: Client,
  schema18: boolean,
): Promise<ColMeta> {
  const noteTypes = new Map<number, NoteType>();
  const deckNames = new Map<number, string>();
  let crt = Math.floor(Date.now() / 1000);

  // Legacy: everything lives in the single `col` row as JSON.
  let usedJson = false;
  try {
    const col = await client.execute(
      "SELECT crt, models, decks FROM col LIMIT 1",
    );
    const row = col.rows[0] as Record<string, unknown> | undefined;
    if (row) {
      crt = Number(row.crt) || crt;
      const models = parseJsonObject(row.models);
      const decks = parseJsonObject(row.decks);
      if (models && Object.keys(models).length > 0) {
        usedJson = true;
        for (const m of Object.values(models) as AnkiModelJson[]) {
          noteTypes.set(Number(m.id), {
            id: Number(m.id),
            name: m.name,
            isCloze: m.type === 1,
            fieldNames: (m.flds ?? []).map((f) => f.name),
            templates: (m.tmpls ?? []).map((t) => ({
              qfmt: t.qfmt,
              afmt: t.afmt,
            })),
          });
        }
      }
      if (decks) {
        for (const d of Object.values(decks) as {
          id: number;
          name: string;
        }[]) {
          deckNames.set(Number(d.id), d.name);
        }
      }
    }
  } catch {
    /* col table may not have these columns in schema 18 */
  }

  // New format: read field names from the `fields` table (templates are stored
  // as protobuf and are skipped — we fall back to field-based extraction).
  if (!usedJson || schema18) {
    await readSchema18Meta(client, noteTypes, deckNames);
  }

  return { crt, noteTypes, deckNames };
}

async function readSchema18Meta(
  client: Client,
  noteTypes: Map<number, NoteType>,
  deckNames: Map<number, string>,
): Promise<void> {
  try {
    const nts = await client.execute("SELECT id, name FROM notetypes");
    const fieldsByNt = new Map<number, { ord: number; name: string }[]>();
    const fields = await client.execute("SELECT ntid, ord, name FROM fields");
    for (const r of fields.rows as unknown as {
      ntid: number;
      ord: number;
      name: string;
    }[]) {
      const list = fieldsByNt.get(Number(r.ntid)) ?? [];
      list.push({ ord: Number(r.ord), name: r.name });
      fieldsByNt.set(Number(r.ntid), list);
    }
    for (const r of nts.rows as unknown as { id: number; name: string }[]) {
      const id = Number(r.id);
      if (noteTypes.has(id)) continue;
      const fieldNames = (fieldsByNt.get(id) ?? [])
        .sort((a, b) => a.ord - b.ord)
        .map((f) => f.name);
      noteTypes.set(id, {
        id,
        name: r.name,
        isCloze: /cloze/i.test(r.name),
        fieldNames,
        templates: null,
      });
    }
  } catch {
    /* not a schema 18 collection */
  }

  if (deckNames.size === 0) {
    try {
      const decks = await client.execute("SELECT id, name FROM decks");
      for (const r of decks.rows as unknown as { id: number; name: string }[]) {
        // Schema 18 stores hierarchy with \x1f; normalise to Anki's "::".
        deckNames.set(Number(r.id), String(r.name).split("\x1f").join("::"));
      }
    } catch {
      /* ignore */
    }
  }
}

type AnkiModelJson = {
  id: number;
  name: string;
  type: number;
  flds: { name: string }[];
  tmpls: { qfmt: string; afmt: string }[];
};

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

// --- card building -----------------------------------------------------------

function buildFieldMap(
  noteType: NoteType,
  fields: string[],
): Record<string, string> {
  const map: Record<string, string> = {};
  noteType.fieldNames.forEach((name, i) => {
    map[name] = fields[i] ?? "";
  });
  return map;
}

type CardRow = {
  nid: number;
  did: number;
  ord: number;
  type: number;
  due: number;
  ivl: number;
  factor: number;
  reps: number;
  lapses: number;
  data: string;
};

/**
 * True if a note is a card type Armin can't import yet. For now we only accept
 * basic front/back cards, so cloze notes (and anything that reads as cloze) are
 * left out — support for other types is planned for later.
 */
function isUnsupportedNote(note: Note, noteType: NoteType): boolean {
  return noteType.isCloze || hasClozeMarkers(note.fields.join(" "));
}

/** Render a basic Anki card row into Armin front/back Markdown. */
function renderBasicCard(
  card: CardRow,
  note: Note,
  noteType: NoteType,
  resolveMedia: (name: string) => string | undefined,
): { front: string; back: string } | null {
  const fieldMap = buildFieldMap(noteType, note.fields);
  const toMd = (html: string) => ankiHtmlToMarkdown(html, { resolveMedia });

  let frontHtml: string;
  let backHtml: string;

  if (noteType.templates && noteType.templates.length > 0) {
    const tmpl = noteType.templates[card.ord] ?? noteType.templates[0];
    frontHtml = renderTemplate(tmpl.qfmt, fieldMap);
    backHtml = renderTemplate(tmpl.afmt, fieldMap, frontHtml);
  } else {
    // Field-based fallback: first field is the front, the rest is the back.
    frontHtml = note.fields[0] ?? "";
    backHtml = note.fields.slice(1).join("<hr>");
  }

  let front = toMd(frontHtml);
  let back = toMd(backHtml);
  if (!front && !back) return null;
  if (!front) front = "—";
  if (!back) back = "—";
  return { front, back };
}

// --- scheduling mapping ------------------------------------------------------

const DAY_MS = 86_400_000;

/**
 * Best-effort translation of Anki's per-card scheduling into FSRS state.
 * Anki's SM-2 numbers don't map cleanly onto FSRS, so this is approximate and
 * the UI warns the user accordingly.
 */
function mapSchedule(card: CardRow, crt: number): FsrsFields | null {
  // type: 0=new, 1=learning, 2=review, 3=relearning
  if (card.type === 0 && card.reps === 0) return null;

  const fsrs = JSON.parse(card.data || "{}") as { s?: number; d?: number };
  const ivlDays =
    card.ivl > 0 ? card.ivl : Math.max(1, Math.round(-card.ivl / 86_400));

  let due: Date;
  if (card.type === 2) {
    // Review due is "days since collection creation".
    due = new Date((crt + card.due * 86_400) * 1000);
  } else if (card.type === 1 || card.type === 3) {
    // Learning/relearning due is an epoch-seconds timestamp.
    due = new Date(card.due * 1000);
  } else {
    due = new Date();
  }

  const stability = fsrs.s ?? Math.max(ivlDays, 0.5);
  const difficulty = fsrs.d ?? clamp(10 - (card.factor - 1300) / 250, 1, 10);
  const lastReview =
    card.type === 2 ? new Date(due.getTime() - ivlDays * DAY_MS) : new Date();

  return {
    due,
    stability,
    difficulty,
    elapsedDays: ivlDays,
    scheduledDays: ivlDays,
    learningSteps: 0,
    reps: card.reps,
    lapses: card.lapses,
    state: card.type,
    lastReview,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// --- public: analyze ---------------------------------------------------------

export async function analyzeAnkiPackage(
  bytes: Uint8Array,
  fileName: string,
): Promise<AnkiAnalysis> {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new Error("This file isn't a valid Anki package (.apkg/.colpkg).");
  }

  const { byName: mediaByName, imageCount } = buildMediaMap(entries);
  const resolveMedia = (name: string): string | undefined =>
    mediaByName.get(name) ?? mediaByName.get(decodeURIComponent(name));

  const { bytes: dbBytes, schema18 } = chooseCollection(entries);
  const { client, cleanup } = await openTempDb(dbBytes);

  try {
    const { crt, noteTypes, deckNames } = await readColMeta(client, schema18);

    const noteRows = await client.execute(
      "SELECT id, mid, tags, flds FROM notes",
    );
    const notesById = new Map<number, Note>();
    for (const r of noteRows.rows as unknown as {
      id: number;
      mid: number;
      tags: string;
      flds: string;
    }[]) {
      notesById.set(Number(r.id), {
        mid: Number(r.mid),
        tags: String(r.tags).split(/\s+/).filter(Boolean),
        fields: String(r.flds).split(FIELD_SEPARATOR),
      });
    }

    const cardRows = await client.execute(
      "SELECT nid, did, ord, type, due, ivl, factor, reps, lapses, data FROM cards ORDER BY id",
    );

    const cards: ParsedCard[] = [];
    const deckCounts = new Map<string, number>();
    let skippedUnsupported = 0;
    let droppedAudio = false;
    let hasScheduling = false;
    let approximatedLayouts = false;

    for (const raw of cardRows.rows as unknown as CardRow[]) {
      const note = notesById.get(Number(raw.nid));
      if (!note) continue;
      const noteType = noteTypes.get(note.mid) ?? fallbackNoteType(note);

      // For now Armin only imports basic front/back cards; skip everything else.
      if (isUnsupportedNote(note, noteType)) {
        skippedUnsupported++;
        continue;
      }
      if (noteType.templates === null) approximatedLayouts = true;

      const card: CardRow = {
        nid: Number(raw.nid),
        did: Number(raw.did),
        ord: Number(raw.ord),
        type: Number(raw.type),
        due: Number(raw.due),
        ivl: Number(raw.ivl),
        factor: Number(raw.factor),
        reps: Number(raw.reps),
        lapses: Number(raw.lapses),
        data: typeof raw.data === "string" ? raw.data : "{}",
      };

      const rendered = renderBasicCard(card, note, noteType, resolveMedia);
      if (!rendered) {
        skippedUnsupported++;
        continue;
      }
      if (/\[sound:/.test(note.fields.join(" "))) droppedAudio = true;

      const deckName = deckNames.get(card.did) ?? "Imported";
      deckCounts.set(deckName, (deckCounts.get(deckName) ?? 0) + 1);

      const schedule = mapSchedule(card, crt);
      if (schedule) hasScheduling = true;

      cards.push({
        front: rendered.front,
        back: rendered.back,
        tags: note.tags,
        deckName,
        schedule,
      });
    }

    if (cards.length === 0) {
      throw new Error(
        skippedUnsupported > 0
          ? "This package has no basic front/back cards. Armin imports those (with tags) for now — other card types like cloze are coming later."
          : "No cards were found in this Anki package.",
      );
    }

    const decks = [...deckCounts.entries()]
      .map(([name, cardCount]) => ({ name, cardCount }))
      .sort((a, b) => b.cardCount - a.cardCount);

    const warnings: string[] = [];
    if (skippedUnsupported > 0)
      warnings.push(
        `${plural(skippedUnsupported, "card")} skipped — Armin imports basic front/back cards for now (other types like cloze are coming later).`,
      );
    if (approximatedLayouts)
      warnings.push(
        "This package uses Anki's newest format; card layouts were simplified to front/back.",
      );
    if (imageCount > 0)
      warnings.push(
        `${plural(imageCount, "image")} embedded directly into cards.`,
      );
    if (droppedAudio)
      warnings.push("Audio was skipped — Armin doesn't support sound yet.");
    if (hasScheduling)
      warnings.push(
        "Anki review history maps approximately onto Armin's FSRS scheduler.",
      );

    const pkg: ParsedPackage = {
      cards,
      decks,
      imageCount,
      hasScheduling,
      warnings,
    };
    const importId = rememberParse(pkg);

    return {
      importId,
      suggestedName: suggestedDeckName(decks, fileName),
      totalCards: cards.length,
      skippedCount: skippedUnsupported,
      decks,
      imageCount,
      hasScheduling,
      warnings,
    };
  } finally {
    cleanup();
  }
}

function fallbackNoteType(note: Note): NoteType {
  return {
    id: note.mid,
    name: "Imported",
    isCloze: hasClozeMarkers(note.fields.join(" ")),
    fieldNames: note.fields.map((_, i) => `Field ${i + 1}`),
    templates: null,
  };
}

function suggestedDeckName(
  decks: { name: string; cardCount: number }[],
  fileName: string,
): string {
  const meaningful = decks.filter((d) => d.name && d.name !== "Default");
  if (meaningful.length === 1) return leafDeckName(meaningful[0].name);
  return (
    fileName
      .replace(/\.[^.]+$/, "")
      .replace(/[_-]+/g, " ")
      .trim() || "Imported deck"
  );
}

function leafDeckName(name: string): string {
  const parts = name.split("::");
  return parts[parts.length - 1].trim() || name;
}

// --- public: commit ----------------------------------------------------------

export type CommitInput = {
  importId: string;
  deckName: string;
  keepScheduling: boolean;
  /** "single" merges every card into one deck; "separate" keeps Anki's decks. */
  deckStrategy: "single" | "separate";
};

export async function commitAnkiImport(
  ctx: ServiceContext,
  input: CommitInput,
): Promise<AnkiImportResult> {
  const cached = parseCache.get(input.importId);
  if (!cached) {
    throw new Error("This import expired — please choose the file again.");
  }
  const { pkg } = cached;

  // Group cards into the decks we'll create.
  const groups = new Map<string, ParsedCard[]>();
  if (input.deckStrategy === "separate") {
    for (const card of pkg.cards) {
      const title = leafDeckName(card.deckName);
      const list = groups.get(title) ?? [];
      list.push(card);
      groups.set(title, list);
    }
  } else {
    groups.set(input.deckName.trim() || "Imported deck", pkg.cards);
  }

  let firstDeckId: string | null = null;
  let cardCount = 0;

  for (const [deckTitle, deckCards] of groups) {
    const deckId = await writeDeck(
      ctx,
      deckTitle,
      deckCards,
      input.keepScheduling,
    );
    firstDeckId ??= deckId;
    cardCount += deckCards.length;
  }

  parseCache.delete(input.importId);
  return { deckCount: groups.size, cardCount, firstDeckId };
}

const CARD_CHUNK = 200;

async function writeDeck(
  ctx: ServiceContext,
  name: string,
  parsedCards: ParsedCard[],
  keepScheduling: boolean,
): Promise<string> {
  const { decks, cards, notes, noteTags } = schema;

  return ctx.db.transaction(async (tx) => {
    const deck = await tx.insert(decks).values({ name }).returning().get();
    const deckId = deck!.id;

    // Resolve the tag set once for the whole deck (case-insensitive, deduped).
    const tagIdByLower = await resolveTags(tx, parsedCards);

    // Each imported card is a basic note that generates one review item.
    const noteTagRows: { noteId: string; tagId: string }[] = [];
    const noteValues: { id: string; deckId: string; type: string; content: string }[] = [];
    const cardValues = parsedCards.map((card) => {
      const noteId = randomUUID();
      noteValues.push({
        id: noteId,
        deckId,
        type: "basic",
        content: JSON.stringify({ front: card.front, back: card.back }),
      });
      for (const tag of card.tags) {
        const tagId = tagIdByLower.get(tag.toLocaleLowerCase());
        if (tagId) noteTagRows.push({ noteId, tagId });
      }
      return {
        id: randomUUID(),
        noteId,
        deckId,
        subKey: "",
        front: card.front,
        back: card.back,
        ...(keepScheduling && card.schedule ? card.schedule : newCardFields()),
      };
    });

    for (let i = 0; i < noteValues.length; i += CARD_CHUNK) {
      await tx
        .insert(notes)
        .values(noteValues.slice(i, i + CARD_CHUNK))
        .run();
    }
    for (let i = 0; i < cardValues.length; i += CARD_CHUNK) {
      await tx
        .insert(cards)
        .values(cardValues.slice(i, i + CARD_CHUNK))
        .run();
    }
    for (let i = 0; i < noteTagRows.length; i += CARD_CHUNK) {
      await tx
        .insert(noteTags)
        .values(noteTagRows.slice(i, i + CARD_CHUNK))
        .onConflictDoNothing()
        .run();
    }

    return deckId;
  });
}

type TxLike = Parameters<Parameters<ServiceContext["db"]["transaction"]>[0]>[0];

/** Ensure every tag used in the deck exists; return a lower-name → id map. */
async function resolveTags(
  tx: TxLike,
  parsedCards: ParsedCard[],
): Promise<Map<string, string>> {
  const { tags } = schema;
  const byLower = new Map<string, string>();
  const wanted = new Map<string, string>(); // lower → display
  for (const card of parsedCards) {
    for (const tag of card.tags) {
      const lower = tag.toLocaleLowerCase();
      if (!wanted.has(lower)) wanted.set(lower, tag);
    }
  }
  if (wanted.size === 0) return byLower;

  const existing = await tx.select().from(tags).all();
  for (const row of existing) byLower.set(row.name.toLocaleLowerCase(), row.id);

  for (const [lower, display] of wanted) {
    if (byLower.has(lower)) continue;
    const created = await tx
      .insert(tags)
      .values({ name: display })
      .returning()
      .get();
    byLower.set(lower, created!.id);
  }
  return byLower;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}
