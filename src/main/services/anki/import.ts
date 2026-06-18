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
import Database from "better-sqlite3";
import { unzipSync } from "fflate";
import { decompress as zstdDecompress } from "fzstd";
import { openSqliteDatabase } from "../../db/better-sqlite";
import { schema } from "../../db";
import {
  generateReviewUnits,
  serializeContent,
  type FlashcardContent,
  type FlashcardType,
  type ImageOcclusionContent,
  type ImageOcclusionGeometry,
  type ImageOcclusionMask,
} from "../flashcard-types";
import type { ServiceContext } from "../context";
import { newReviewUnitFields, type FsrsFields } from "../scheduler";
import { ankiHtmlToMarkdown } from "./html";
import { hasClozeMarkers, renderTemplate } from "./template";

const FIELD_SEPARATOR = "\x1f";
const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd];

// --- types shared with the renderer ------------------------------------------

/** A single authored note ready to be written to Armin. */
type ParsedNote = {
  type: FlashcardType;
  content: FlashcardContent;
  tags: string[];
  /** Original Anki deck name (may be hierarchical, e.g. "Parent::Child"). */
  deckName: string;
  /** Best-effort FSRS scheduling carried over from Anki by generated subKey. */
  schedules: Map<string, FsrsFields>;
};

type ParsedPackage = {
  notes: ParsedNote[];
  importedTypes: ImportTypeCount[];
  skippedNotes: SkippedAnkiNote[];
  decks: { name: string; cardCount: number }[];
  imageCount: number;
  hasScheduling: boolean;
  warnings: string[];
};

export type ImportTypeCount = {
  type: FlashcardType;
  count: number;
};

export type SkippedAnkiNote = {
  noteId: number;
  noteType: string;
  cardCount: number;
  reason: string;
};

/** The serializable summary returned to the renderer after analysis. */
export type AnkiAnalysis = {
  importId: string;
  suggestedName: string;
  totalCards: number;
  importedTypes: ImportTypeCount[];
  /** Cards left out because they could not be mapped to an Armin card type. */
  skippedCount: number;
  skippedNotes: SkippedAnkiNote[];
  decks: { name: string; cardCount: number }[];
  imageCount: number;
  hasScheduling: boolean;
  warnings: string[];
};

export type AnkiImportResult = {
  deckCount: number;
  cardCount: number;
  importedTypes: ImportTypeCount[];
  skippedCount: number;
  skippedNotes: SkippedAnkiNote[];
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

/** Read all rows of a query as plain objects (mirrors libSQL's `.rows`). */
function queryRows(
  client: Database.Database,
  sql: string,
): Record<string, unknown>[] {
  return client.prepare(sql).all() as Record<string, unknown>[];
}

function openTempDb(bytes: Uint8Array): {
  client: Database.Database;
  cleanup: () => void;
} {
  const tmpPath = path.join(os.tmpdir(), `armin-anki-${randomUUID()}.db`);
  fs.writeFileSync(tmpPath, Buffer.from(bytes));
  const client = openSqliteDatabase(tmpPath, { readonly: true });
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

function readColMeta(client: Database.Database, schema18: boolean): ColMeta {
  const noteTypes = new Map<number, NoteType>();
  const deckNames = new Map<number, string>();
  let crt = Math.floor(Date.now() / 1000);

  // Legacy: everything lives in the single `col` row as JSON.
  let usedJson = false;
  try {
    const col = queryRows(client, "SELECT crt, models, decks FROM col LIMIT 1");
    const row = col[0] as Record<string, unknown> | undefined;
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
    readSchema18Meta(client, noteTypes, deckNames);
  }

  return { crt, noteTypes, deckNames };
}

function readSchema18Meta(
  client: Database.Database,
  noteTypes: Map<number, NoteType>,
  deckNames: Map<number, string>,
): void {
  try {
    const nts = queryRows(client, "SELECT id, name FROM notetypes");
    const fieldsByNt = new Map<number, { ord: number; name: string }[]>();
    const fields = queryRows(client, "SELECT ntid, ord, name FROM fields");
    for (const r of fields as unknown as {
      ntid: number;
      ord: number;
      name: string;
    }[]) {
      const list = fieldsByNt.get(Number(r.ntid)) ?? [];
      list.push({ ord: Number(r.ord), name: r.name });
      fieldsByNt.set(Number(r.ntid), list);
    }
    for (const r of nts as unknown as { id: number; name: string }[]) {
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
      const decks = queryRows(client, "SELECT id, name FROM decks");
      for (const r of decks as unknown as { id: number; name: string }[]) {
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

function isTypeAnswerTemplate(template: string): boolean {
  return /\{\{\s*type\s*:[^}]+\}\}/i.test(template);
}

function typeAnswerField(template: string): string | null {
  const match = template.match(/\{\{\s*type\s*:\s*([^}]+?)\s*\}\}/i);
  return match?.[1]?.trim() || null;
}

function withoutTypeAnswer(template: string): string {
  return template.replace(/\{\{\s*type\s*:[^}]+\}\}/gi, "");
}

function convertAnkiClozes(text: string): string {
  return text.replace(
    /\{\{c(\d+)::([\s\S]*?)\}\}/g,
    (_whole, n: string, body: string) => `{{${n}::${body}}}`,
  );
}

function parsedCardCount(note: ParsedNote): number {
  return generateReviewUnits(note.type, note.content).length;
}

function sameCard(
  a: { front: string; back: string },
  b: { front: string; back: string },
) {
  return a.front.trim() === b.front.trim() && a.back.trim() === b.back.trim();
}

function buildBasicLikeNote(
  rows: CardRow[],
  note: Note,
  noteType: NoteType,
  deckNames: Map<number, string>,
  crt: number,
  resolveMedia: (name: string) => string | undefined,
): ParsedNote | null {
  const fieldMap = buildFieldMap(noteType, note.fields);
  const frontField = fieldMap.Front ?? note.fields[0];
  const backField = fieldMap.Back ?? note.fields[1];

  if (!isBasicLikeNoteType(noteType, fieldMap)) return null;

  if (rows.length >= 2 && frontField && backField) {
    const toMd = (html: string) => ankiHtmlToMarkdown(html, { resolveMedia });
    const schedules = new Map<string, FsrsFields>();
    const sortedRows = [...rows].sort((a, b) => a.ord - b.ord);
    const fwd = mapSchedule(sortedRows[0], crt);
    const rev = mapSchedule(sortedRows[1], crt);
    if (fwd) schedules.set("", fwd);
    if (rev) schedules.set("rev", rev);
    return {
      type: "basic_reversed",
      content: { front: toMd(frontField), back: toMd(backField) },
      tags: note.tags,
      deckName: deckNames.get(sortedRows[0].did) ?? "Imported",
      schedules,
    };
  }

  const rendered = rows
    .map((card) => ({
      card,
      rendered: renderBasicCard(card, note, noteType, resolveMedia),
    }))
    .filter(
      (
        entry,
      ): entry is {
        card: CardRow;
        rendered: { front: string; back: string };
      } => entry.rendered !== null,
    );
  if (rendered.length === 0) return null;

  const first = rendered[0];
  const deckName = deckNames.get(first.card.did) ?? "Imported";

  if (rendered.length === 2) {
    const [a, b] = rendered;
    if (
      sameCard(
        { front: a.rendered.front, back: a.rendered.back },
        {
          front: b.rendered.back,
          back: b.rendered.front,
        },
      )
    ) {
      const schedules = new Map<string, FsrsFields>();
      const fwd = mapSchedule(a.card, crt);
      const rev = mapSchedule(b.card, crt);
      if (fwd) schedules.set("", fwd);
      if (rev) schedules.set("rev", rev);
      return {
        type: "basic_reversed",
        content: { front: a.rendered.front, back: a.rendered.back },
        tags: note.tags,
        deckName,
        schedules,
      };
    }
  }

  const schedule = mapSchedule(first.card, crt);
  return {
    type: "basic",
    content: { front: first.rendered.front, back: first.rendered.back },
    tags: note.tags,
    deckName,
    schedules: schedule ? new Map([["", schedule]]) : new Map(),
  };
}

function isBasicLikeNoteType(
  noteType: NoteType,
  fieldMap: Record<string, string>,
): boolean {
  if (!fieldMap.Front || !fieldMap.Back) return false;
  return /^basic\b/i.test(noteType.name);
}

function buildClozeNote(
  rows: CardRow[],
  note: Note,
  noteType: NoteType,
  deckNames: Map<number, string>,
  crt: number,
  resolveMedia: (name: string) => string | undefined,
): ParsedNote | null {
  const fieldMap = buildFieldMap(noteType, note.fields);
  const textField = noteType.fieldNames.find((name) =>
    hasClozeMarkers(fieldMap[name] ?? ""),
  );
  const rawText = textField
    ? fieldMap[textField]
    : note.fields.find(hasClozeMarkers);
  if (!rawText) return null;

  const toMd = (html: string) => ankiHtmlToMarkdown(html, { resolveMedia });
  const text = convertAnkiClozes(toMd(rawText));
  const schedules = new Map<string, FsrsFields>();
  for (const row of rows) {
    const schedule = mapSchedule(row, crt);
    if (schedule) schedules.set(`c${row.ord + 1}`, schedule);
  }

  return {
    type: "cloze",
    content: { text },
    tags: note.tags,
    deckName: deckNames.get(rows[0]?.did) ?? "Imported",
    schedules,
  };
}

function buildTypeAnswerNote(
  rows: CardRow[],
  note: Note,
  noteType: NoteType,
  deckNames: Map<number, string>,
  crt: number,
  resolveMedia: (name: string) => string | undefined,
): ParsedNote | null {
  const template = noteType.templates?.find((t) =>
    isTypeAnswerTemplate(t.qfmt),
  );
  if (!template) return null;
  const answerField = typeAnswerField(template.qfmt);
  if (!answerField) return null;

  const fieldMap = buildFieldMap(noteType, note.fields);
  const toMd = (html: string) => ankiHtmlToMarkdown(html, { resolveMedia });
  const prompt = toMd(
    renderTemplate(withoutTypeAnswer(template.qfmt), fieldMap),
  ).trim();
  const answer = toMd(fieldMap[answerField] ?? "").trim();
  if (!prompt || !answer) return null;

  const first = rows[0];
  const schedule = first ? mapSchedule(first, crt) : null;
  return {
    type: "type_answer",
    content: { prompt, answer, acceptedAnswers: [] },
    tags: note.tags,
    deckName: deckNames.get(first?.did) ?? "Imported",
    schedules: schedule ? new Map([["", schedule]]) : new Map(),
  };
}

function fieldByName(
  note: Note,
  noteType: NoteType,
  names: string[],
): string | null {
  const lowerNames = names.map((name) => name.toLocaleLowerCase());
  for (let i = 0; i < noteType.fieldNames.length; i++) {
    if (lowerNames.includes(noteType.fieldNames[i].toLocaleLowerCase())) {
      return note.fields[i] ?? null;
    }
  }
  return null;
}

function fieldNameIndex(noteType: NoteType, names: string[]): number {
  const lowerNames = names.map((name) => name.toLocaleLowerCase());
  return noteType.fieldNames.findIndex((field) =>
    lowerNames.includes(field.toLocaleLowerCase()),
  );
}

function isNativeImageOcclusionNote(
  note: Note,
  noteType: NoteType,
): boolean {
  const hasNativeFields =
    fieldNameIndex(noteType, ["occlusions"]) !== -1 &&
    fieldNameIndex(noteType, ["image"]) !== -1;
  return (
    /image\s+occlusion/i.test(noteType.name) ||
    hasNativeFields ||
    note.fields.some((field) => /image-occlusion:/i.test(field))
  );
}

function isLegacyImageOcclusionEnhancedNote(noteType: NoteType): boolean {
  const names = noteType.fieldNames.map((name) => name.toLocaleLowerCase());
  const hasLegacyMasks = ["question mask", "answer mask", "original mask"].some(
    (name) => names.includes(name),
  );
  return /image\s+occlusion\s+enhanced/i.test(noteType.name) || hasLegacyMasks;
}

function markdownImageUrl(markdown: string): string | null {
  return markdown.match(/!\[[^\]]*\]\(([^)]+)\)/)?.[1] ?? null;
}

function imageDimensionsFromDataUrl(
  dataUrl: string,
): { width: number; height: number } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const mime = match[1].toLocaleLowerCase();
  const bytes = Buffer.from(match[2], "base64");
  if (mime === "image/png" && bytes.length >= 24) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (mime === "image/jpeg") {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) return null;
      const marker = bytes[offset + 1];
      const length = bytes.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xc3) {
        return {
          height: bytes.readUInt16BE(offset + 5),
          width: bytes.readUInt16BE(offset + 7),
        };
      }
      offset += 2 + length;
    }
  }
  return null;
}

function splitUnescapedColon(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  let escaped = false;
  for (const char of value) {
    if (escaped) {
      current += char;
      escaped = false;
    } else if (char === "\\") {
      escaped = true;
    } else if (char === ":") {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts;
}

type NativeIoShape = {
  ordinal: number;
  type: string;
  props: Record<string, string>;
};

function parseNativeImageOcclusionShapes(occlusions: string): NativeIoShape[] {
  const shapes: NativeIoShape[] = [];
  const re = /\{\{c(\d+)::image-occlusion:([\s\S]*?)\}\}/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(occlusions)) !== null) {
    const ordinal = Number(match[1]);
    const parts = splitUnescapedColon(match[2].trim());
    const type = parts.shift()?.trim().toLocaleLowerCase() ?? "";
    const props: Record<string, string> = {};
    for (const part of parts) {
      const eq = part.indexOf("=");
      if (eq === -1) continue;
      props[part.slice(0, eq).trim().toLocaleLowerCase()] = part.slice(eq + 1);
    }
    if (Number.isInteger(ordinal) && ordinal > 0 && type) {
      shapes.push({ ordinal, type, props });
    }
  }
  return shapes;
}

function numberProp(
  props: Record<string, string>,
  name: string,
): number | null {
  const value = Number.parseFloat(props[name] ?? "");
  return Number.isFinite(value) ? value : null;
}

function boundingBoxFromPoints(points: string): ImageOcclusionGeometry | null {
  const parsed = points
    .trim()
    .split(/\s+/)
    .map((point) => {
      const [x, y] = point.split(",").map((n) => Number.parseFloat(n));
      return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
    })
    .filter((point): point is { x: number; y: number } => point !== null);
  if (parsed.length === 0) return null;
  const xs = parsed.map((point) => point.x);
  const ys = parsed.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    w: Math.max(...xs) - x,
    h: Math.max(...ys) - y,
  };
}

function nativeShapeGeometry(shape: NativeIoShape): ImageOcclusionGeometry | null {
  const left = numberProp(shape.props, "left");
  const top = numberProp(shape.props, "top");
  const width = numberProp(shape.props, "width");
  const height = numberProp(shape.props, "height");
  if (shape.type === "polygon") {
    const fromPoints = shape.props.points
      ? boundingBoxFromPoints(shape.props.points)
      : null;
    if (fromPoints) return fromPoints;
  }
  if (left == null || top == null) return null;
  if (width != null && height != null) return { x: left, y: top, w: width, h: height };
  if (shape.type === "ellipse") {
    const rx = numberProp(shape.props, "rx");
    const ry = numberProp(shape.props, "ry");
    if (rx != null && ry != null) return { x: left, y: top, w: rx * 2, h: ry * 2 };
  }
  return null;
}

function normalizeGeometry(
  geometry: ImageOcclusionGeometry,
  dimensions: { width: number; height: number } | null,
): ImageOcclusionGeometry {
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
    return geometry;
  }
  return {
    x: geometry.x / dimensions.width,
    y: geometry.y / dimensions.height,
    w: geometry.w / dimensions.width,
    h: geometry.h / dimensions.height,
  };
}

function unionGeometry(geometries: ImageOcclusionGeometry[]): ImageOcclusionGeometry {
  const x1 = Math.min(...geometries.map((g) => g.x));
  const y1 = Math.min(...geometries.map((g) => g.y));
  const x2 = Math.max(...geometries.map((g) => g.x + g.w));
  const y2 = Math.max(...geometries.map((g) => g.y + g.h));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

function buildNativeImageOcclusionNote(
  rows: CardRow[],
  note: Note,
  noteType: NoteType,
  deckNames: Map<number, string>,
  crt: number,
  resolveMedia: (name: string) => string | undefined,
): ParsedNote | null {
  const imageHtml = fieldByName(note, noteType, ["image"]);
  const occlusions = fieldByName(note, noteType, ["occlusions", "occlusion"]);
  if (!imageHtml || !occlusions || !/image-occlusion:/i.test(occlusions)) {
    return null;
  }

  const image = markdownImageUrl(ankiHtmlToMarkdown(imageHtml, { resolveMedia }));
  if (!image) return null;

  const dimensions = imageDimensionsFromDataUrl(image);
  if (!dimensions) return null;
  const shapes = parseNativeImageOcclusionShapes(occlusions);
  const supportedShapes = shapes.filter((shape) =>
    ["rect", "ellipse", "polygon"].includes(shape.type),
  );
  if (supportedShapes.length !== shapes.length || supportedShapes.length === 0) {
    return null;
  }

  const byOrdinal = new Map<number, ImageOcclusionGeometry[]>();
  for (const shape of supportedShapes) {
    const geometry = nativeShapeGeometry(shape);
    if (!geometry) return null;
    const list = byOrdinal.get(shape.ordinal) ?? [];
    list.push(normalizeGeometry(geometry, dimensions));
    byOrdinal.set(shape.ordinal, list);
  }

  const masks: ImageOcclusionMask[] = [...byOrdinal.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ordinal, geometries]) => ({
      id: `c${ordinal}`,
      geometry: unionGeometry(geometries),
    }));
  if (masks.length === 0) return null;

  const header = ankiHtmlToMarkdown(
    fieldByName(note, noteType, ["header"]) ?? "",
    { resolveMedia },
  ).trim();
  const extraParts = [
    fieldByName(note, noteType, ["back extra", "back_extra"]),
    fieldByName(note, noteType, ["comments"]),
  ]
    .map((field) => ankiHtmlToMarkdown(field ?? "", { resolveMedia }).trim())
    .filter(Boolean);

  const schedules = new Map<string, FsrsFields>();
  for (const row of rows) {
    const id = `c${row.ord + 1}`;
    if (!masks.some((mask) => mask.id === id)) continue;
    const schedule = mapSchedule(row, crt);
    if (schedule) schedules.set(id, schedule);
  }

  const revealMode = supportedShapes.some(
    (shape) => shape.props.oi === "1" || shape.props.occludeinactive === "1",
  )
    ? "hide_all"
    : "hide_one";
  const content: ImageOcclusionContent = {
    baseImage: image,
    masks,
    revealMode,
    ...(header ? { header } : {}),
    ...(extraParts.length > 0 ? { extra: extraParts.join("\n\n") } : {}),
  };

  return {
    type: "image_occlusion",
    content,
    tags: note.tags,
    deckName: deckNames.get(rows[0]?.did) ?? "Imported",
    schedules,
  };
}

function buildImageOcclusionNote(
  rows: CardRow[],
  note: Note,
  noteType: NoteType,
  deckNames: Map<number, string>,
  crt: number,
  resolveMedia: (name: string) => string | undefined,
): ParsedNote | null {
  const native = buildNativeImageOcclusionNote(
    rows,
    note,
    noteType,
    deckNames,
    crt,
    resolveMedia,
  );
  if (native) return native;

  const imageHtml = fieldByName(note, noteType, [
    "image",
    "picture",
    "diagram",
  ]);
  const regionsJson = fieldByName(note, noteType, ["regions", "region"]);
  if (!imageHtml || !regionsJson) return null;

  let regions: unknown;
  try {
    regions = JSON.parse(regionsJson);
  } catch {
    return null;
  }
  if (!Array.isArray(regions) || regions.length === 0) return null;

  const image = ankiHtmlToMarkdown(imageHtml, { resolveMedia }).match(
    /!\[[^\]]*\]\(([^)]+)\)/,
  )?.[1];
  if (!image) return null;

  const masks = regions.map((region, index) => {
    const raw = region as {
      id?: unknown;
      x?: unknown;
      y?: unknown;
      w?: unknown;
      h?: unknown;
      label?: unknown;
      hint?: unknown;
    };
    return {
      id: typeof raw.id === "string" ? raw.id : `r${index + 1}`,
      geometry: {
        x: typeof raw.x === "number" ? raw.x : 0,
        y: typeof raw.y === "number" ? raw.y : 0,
        w: typeof raw.w === "number" ? raw.w : 0,
        h: typeof raw.h === "number" ? raw.h : 0,
      },
      ...(typeof raw.label === "string" && raw.label.trim()
        ? { label: raw.label }
        : {}),
      ...(typeof raw.hint === "string" && raw.hint.trim()
        ? { hint: raw.hint }
        : {}),
    };
  });

  const schedules = new Map<string, FsrsFields>();
  rows.forEach((row, index) => {
    const id = masks[index]?.id ?? `r${index + 1}`;
    const schedule = mapSchedule(row, crt);
    if (schedule) schedules.set(id, schedule);
  });

  return {
    type: "image_occlusion",
    content: { baseImage: image, masks, revealMode: "hide_all" } as FlashcardContent,
    tags: note.tags,
    deckName: deckNames.get(rows[0]?.did) ?? "Imported",
    schedules,
  };
}

function buildParsedNote(
  rows: CardRow[],
  note: Note,
  noteType: NoteType,
  deckNames: Map<number, string>,
  crt: number,
  resolveMedia: (name: string) => string | undefined,
): ParsedNote | null {
  const imageOcclusion = buildImageOcclusionNote(
    rows,
    note,
    noteType,
    deckNames,
    crt,
    resolveMedia,
  );
  if (imageOcclusion) return imageOcclusion;
  if (
    isNativeImageOcclusionNote(note, noteType) ||
    isLegacyImageOcclusionEnhancedNote(noteType)
  ) {
    return null;
  }
  if (noteType.isCloze || hasClozeMarkers(note.fields.join(" "))) {
    return buildClozeNote(rows, note, noteType, deckNames, crt, resolveMedia);
  }
  return (
    buildTypeAnswerNote(rows, note, noteType, deckNames, crt, resolveMedia) ??
    buildBasicLikeNote(rows, note, noteType, deckNames, crt, resolveMedia)
  );
}

function skipReasonFor(note: Note, noteType: NoteType): string {
  if (isLegacyImageOcclusionEnhancedNote(noteType)) {
    return "Legacy Image Occlusion Enhanced masks are not safely parseable and were skipped.";
  }
  if (isNativeImageOcclusionNote(note, noteType)) {
    return "Native Anki Image Occlusion note could not be parsed safely.";
  }
  if (noteType.isCloze) return "Cloze note has no cloze deletions.";
  if (noteType.templates === null) {
    return "Anki note layout was unavailable and fields did not match a supported Armin type.";
  }
  return "Anki note type does not map to a supported Armin flashcard type.";
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
  const { client, cleanup } = openTempDb(dbBytes);

  try {
    const { crt, noteTypes, deckNames } = readColMeta(client, schema18);

    const noteRows = queryRows(client, "SELECT id, mid, tags, flds FROM notes");
    const notesById = new Map<number, Note>();
    for (const r of noteRows as unknown as {
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

    const cardRows = queryRows(
      client,
      "SELECT nid, did, ord, type, due, ivl, factor, reps, lapses, data FROM cards ORDER BY id",
    );

    const notes: ParsedNote[] = [];
    const deckCounts = new Map<string, number>();
    const importedTypeCounts = new Map<FlashcardType, number>();
    const skippedNotes: SkippedAnkiNote[] = [];
    let skippedUnsupported = 0;
    let droppedAudio = false;
    let hasScheduling = false;
    let approximatedLayouts = false;
    const cardsByNoteId = new Map<number, CardRow[]>();

    for (const raw of cardRows as unknown as CardRow[]) {
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
      const list = cardsByNoteId.get(card.nid) ?? [];
      list.push(card);
      cardsByNoteId.set(card.nid, list);
    }

    for (const [nid, rows] of cardsByNoteId) {
      const note = notesById.get(nid);
      if (!note) continue;
      const noteType = noteTypes.get(note.mid) ?? fallbackNoteType(note);
      if (noteType.templates === null) approximatedLayouts = true;

      if (/\[sound:/.test(note.fields.join(" "))) droppedAudio = true;
      const parsed = buildParsedNote(
        rows,
        note,
        noteType,
        deckNames,
        crt,
        resolveMedia,
      );
      if (!parsed) {
        skippedUnsupported += rows.length;
        skippedNotes.push({
          noteId: nid,
          noteType: noteType.name,
          cardCount: rows.length,
          reason: skipReasonFor(note, noteType),
        });
        continue;
      }

      const cardCount = parsedCardCount(parsed);
      importedTypeCounts.set(
        parsed.type,
        (importedTypeCounts.get(parsed.type) ?? 0) + cardCount,
      );
      deckCounts.set(
        parsed.deckName,
        (deckCounts.get(parsed.deckName) ?? 0) + cardCount,
      );
      if (parsed.schedules.size > 0) hasScheduling = true;
      notes.push(parsed);
    }

    if (notes.length === 0) {
      throw new Error(
        skippedUnsupported > 0
          ? "This package has no supported cards. Armin imports basic, reversed, cloze, type-answer, and image-occlusion notes."
          : "No cards were found in this Anki package.",
      );
    }

    const decks = [...deckCounts.entries()]
      .map(([name, cardCount]) => ({ name, cardCount }))
      .sort((a, b) => b.cardCount - a.cardCount);

    const warnings: string[] = [];
    if (skippedUnsupported > 0)
      warnings.push(
        `${plural(skippedUnsupported, "card")} skipped — Armin could not map them to a supported card type.`,
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

    const importedTypes = [...importedTypeCounts.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));

    const pkg: ParsedPackage = {
      notes,
      importedTypes,
      skippedNotes,
      decks,
      imageCount,
      hasScheduling,
      warnings,
    };
    const importId = rememberParse(pkg);

    return {
      importId,
      suggestedName: suggestedDeckName(decks, fileName),
      totalCards: notes.reduce((sum, note) => sum + parsedCardCount(note), 0),
      importedTypes,
      skippedCount: skippedUnsupported,
      skippedNotes,
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
  const groups = new Map<string, ParsedNote[]>();
  if (input.deckStrategy === "separate") {
    for (const note of pkg.notes) {
      const title = leafDeckName(note.deckName);
      const list = groups.get(title) ?? [];
      list.push(note);
      groups.set(title, list);
    }
  } else {
    groups.set(input.deckName.trim() || "Imported deck", pkg.notes);
  }

  let firstDeckId: string | null = null;
  let cardCount = 0;

  for (const [deckTitle, deckNotes] of groups) {
    const deckId = await writeDeck(
      ctx,
      deckTitle,
      deckNotes,
      input.keepScheduling,
    );
    firstDeckId ??= deckId;
    cardCount += deckNotes.reduce(
      (sum, note) => sum + parsedCardCount(note),
      0,
    );
  }

  parseCache.delete(input.importId);
  return {
    deckCount: groups.size,
    cardCount,
    importedTypes: pkg.importedTypes,
    skippedCount: pkg.skippedNotes.reduce((sum, note) => sum + note.cardCount, 0),
    skippedNotes: pkg.skippedNotes,
    firstDeckId,
  };
}

const CARD_CHUNK = 200;

async function writeDeck(
  ctx: ServiceContext,
  name: string,
  parsedNotes: ParsedNote[],
  keepScheduling: boolean,
): Promise<string> {
  const { decks, reviewUnits, flashcards, flashcardTags } = schema;

  return ctx.db.transaction((tx) => {
    const deck = tx.insert(decks).values({ name }).returning().get();
    const deckId = deck!.id;

    // Resolve the tag set once for the whole deck (case-insensitive, deduped).
    const tagIdByLower = resolveTags(tx, parsedNotes);

    const noteTagRows: { flashcardId: string; tagId: string }[] = [];
    const noteValues: {
      id: string;
      deckId: string;
      type: string;
      content: string;
    }[] = [];
    const cardValues = [];

    for (const parsedNote of parsedNotes) {
      const flashcardId = randomUUID();
      noteValues.push({
        id: flashcardId,
        deckId,
        type: parsedNote.type,
        content: serializeContent(parsedNote.content),
      });
      for (const tag of parsedNote.tags) {
        const tagId = tagIdByLower.get(tag.toLocaleLowerCase());
        if (tagId) noteTagRows.push({ flashcardId, tagId });
      }
      for (const item of generateReviewUnits(
        parsedNote.type,
        parsedNote.content,
      )) {
        cardValues.push({
          id: randomUUID(),
          flashcardId,
          deckId,
          subKey: item.subKey,
          front: item.front,
          back: item.back,
          ...(keepScheduling && parsedNote.schedules.get(item.subKey)
            ? parsedNote.schedules.get(item.subKey)!
            : newReviewUnitFields()),
        });
      }
    }

    for (let i = 0; i < noteValues.length; i += CARD_CHUNK) {
      tx.insert(flashcards)
        .values(noteValues.slice(i, i + CARD_CHUNK))
        .run();
    }
    for (let i = 0; i < cardValues.length; i += CARD_CHUNK) {
      tx.insert(reviewUnits)
        .values(cardValues.slice(i, i + CARD_CHUNK))
        .run();
    }
    for (let i = 0; i < noteTagRows.length; i += CARD_CHUNK) {
      tx.insert(flashcardTags)
        .values(noteTagRows.slice(i, i + CARD_CHUNK))
        .onConflictDoNothing()
        .run();
    }

    return deckId;
  });
}

type TxLike = Parameters<Parameters<ServiceContext["db"]["transaction"]>[0]>[0];

/** Ensure every tag used in the deck exists; return a lower-name → id map. */
function resolveTags(
  tx: TxLike,
  parsedNotes: ParsedNote[],
): Map<string, string> {
  const { tags } = schema;
  const byLower = new Map<string, string>();
  const wanted = new Map<string, string>(); // lower → display
  for (const note of parsedNotes) {
    for (const tag of note.tags) {
      const lower = tag.toLocaleLowerCase();
      if (!wanted.has(lower)) wanted.set(lower, tag);
    }
  }
  if (wanted.size === 0) return byLower;

  const existing = tx.select().from(tags).all();
  for (const row of existing) byLower.set(row.name.toLocaleLowerCase(), row.id);

  for (const [lower, display] of wanted) {
    if (byLower.has(lower)) continue;
    const created = tx.insert(tags).values({ name: display }).returning().get();
    byLower.set(lower, created!.id);
  }
  return byLower;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}
