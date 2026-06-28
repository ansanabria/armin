import { app } from "electron";
import { strToU8, zipSync } from "fflate";
import { asc, eq } from "drizzle-orm";
import { schema, snapshotProfileDb } from "../db";
import { getLocalSchemaVersion } from "../db/schema-version";
import type { Deck, Flashcard, ReviewUnit } from "../db/schema";
import {
  BACKUP_DB_ENTRY,
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  BACKUP_MANIFEST_ENTRY,
  BACKUP_MEDIA_PREFIX,
  type BackupManifest,
} from "./backup-format";
import {
  isMediaRef,
  listProfileMediaFiles,
  mediaFileNameFromRef,
  readProfileMediaFile,
  rewriteMarkdownMediaForExport,
} from "./media";
import {
  parseStoredContent,
  type BasicContent,
  type ClozeContent,
  type FlashcardContent,
  type FlashcardType,
  type ImageOcclusionContent,
  type TypeAnswerContent,
} from "./flashcard-types";
import type { ServiceContext } from "./context";

const { decks, flashcards, flashcardPrereqs, reviewUnits, tags, flashcardTags } =
  schema;

/** Human-readable FSRS state labels, indexed by the stored `state` enum. */
const STATE_LABELS = ["New", "Learning", "Review", "Relearning"] as const;

function stateLabel(state: number): string {
  return STATE_LABELS[state] ?? `State ${state}`;
}

const FLASHCARD_TYPE_LABELS: Record<FlashcardType, string> = {
  basic: "Basic",
  basic_reversed: "Basic (reversed)",
  cloze: "Cloze",
  type_answer: "Type answer",
  image_occlusion: "Image occlusion",
};

export type ProfileExport = {
  /** Suggested download filename, e.g. `Armin-MyProfile-2026-06-20.zip`. */
  fileName: string;
  /** The zipped Markdown bundle. */
  bytes: Uint8Array;
  deckCount: number;
  flashcardCount: number;
};

/**
 * Build a single backup archive for a profile. The zip is both human-readable
 * and a true backup:
 *   - `library/` — one Markdown file per deck plus a README index (readable)
 *   - `armin.db` + `media/` — lossless Profile data (restorable)
 *   - `manifest.json` — format + version metadata used by restore
 *   - `README.md` — a short note describing the archive
 */
export async function exportProfileToMarkdownZip(
  ctx: ServiceContext,
  profileName: string,
  now: Date = new Date(),
): Promise<ProfileExport> {
  const db = ctx.db;

  const [deckRows, flashcardRows, prereqRows, reviewUnitRows, tagRows] =
    await Promise.all([
      db.select().from(decks).orderBy(asc(decks.createdAt)).all(),
      db.select().from(flashcards).orderBy(asc(flashcards.createdAt)).all(),
      db.select().from(flashcardPrereqs).all(),
      db.select().from(reviewUnits).orderBy(asc(reviewUnits.subKey)).all(),
      db
        .select({ flashcardId: flashcardTags.flashcardId, name: tags.name })
        .from(flashcardTags)
        .innerJoin(tags, eq(flashcardTags.tagId, tags.id))
        .all(),
    ]);

  const deckNameById = new Map(deckRows.map((d) => [d.id, d.name]));

  const tagsByFlashcard = new Map<string, string[]>();
  for (const row of tagRows) {
    const list = tagsByFlashcard.get(row.flashcardId) ?? [];
    list.push(row.name);
    tagsByFlashcard.set(row.flashcardId, list);
  }
  for (const list of tagsByFlashcard.values()) {
    list.sort((a, b) => a.localeCompare(b));
  }

  const prereqIdsByDependent = new Map<string, string[]>();
  for (const edge of prereqRows) {
    const list = prereqIdsByDependent.get(edge.dependentId) ?? [];
    list.push(edge.prereqId);
    prereqIdsByDependent.set(edge.dependentId, list);
  }

  const reviewUnitsByFlashcard = new Map<string, ReviewUnit[]>();
  for (const unit of reviewUnitRows) {
    const list = reviewUnitsByFlashcard.get(unit.flashcardId) ?? [];
    list.push(unit);
    reviewUnitsByFlashcard.set(unit.flashcardId, list);
  }

  const flashcardsByDeck = new Map<string, Flashcard[]>();
  for (const flashcard of flashcardRows) {
    const list = flashcardsByDeck.get(flashcard.deckId) ?? [];
    list.push(flashcard);
    flashcardsByDeck.set(flashcard.deckId, list);
  }

  // A short, human-friendly reference for cross-deck prerequisite links.
  const refByFlashcard = new Map<string, string>();
  for (const flashcard of flashcardRows) {
    const { content, type } = safeParse(flashcard);
    const deckName = deckNameById.get(flashcard.deckId);
    const label = oneLine(representativeFront(type, content), 80);
    refByFlashcard.set(
      flashcard.id,
      deckName ? `${deckName} › ${label}` : label,
    );
  }

  const usedNames = new Set<string>();
  const files: Record<string, Uint8Array> = {};
  // `link` is relative to library/README.md; the zip entry lives under library/.
  const deckSummaries: { name: string; link: string; count: number }[] = [];

  for (const deck of deckRows) {
    const deckFlashcards = flashcardsByDeck.get(deck.id) ?? [];
    const fileName = uniqueFileName(deck.name, usedNames);
    const markdown = renderDeckMarkdown(deck, deckFlashcards, {
      tagsByFlashcard,
      prereqIdsByDependent,
      reviewUnitsByFlashcard,
      refByFlashcard,
    });
    files[`library/decks/${fileName}`] = strToU8(markdown);
    deckSummaries.push({
      name: deck.name,
      link: `decks/${fileName}`,
      count: deckFlashcards.length,
    });
  }

  files["library/README.md"] = strToU8(
    renderReadme(profileName, now, deckSummaries, flashcardRows.length),
  );

  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    app: appVersion(),
    schemaVersion: getLocalSchemaVersion(),
    profileName,
    exportedAt: now.toISOString(),
    deckCount: deckRows.length,
    flashcardCount: flashcardRows.length,
  };
  files[BACKUP_MANIFEST_ENTRY] = strToU8(JSON.stringify(manifest, null, 2));
  files[BACKUP_DB_ENTRY] = snapshotProfileDb(ctx.profileId);
  for (const fileName of listProfileMediaFiles(ctx.profileId)) {
    files[`${BACKUP_MEDIA_PREFIX}${fileName}`] = readProfileMediaFile(
      ctx.profileId,
      fileName,
    );
  }
  files["README.md"] = strToU8(renderArchiveReadme(profileName, now));

  const bytes = zipSync(files, { level: 9 });

  return {
    fileName: `Armin-${slugify(profileName) || "export"}-${isoDate(now)}.zip`,
    bytes,
    deckCount: deckRows.length,
    flashcardCount: flashcardRows.length,
  };
}

/** Top-level note explaining what the archive is and how to restore it. */
function renderArchiveReadme(profileName: string, now: Date): string {
  return [
    `# ${profileName} — Armin backup`,
    "",
    `Created ${now.toISOString()}.`,
    "",
    "This archive is both a readable export and a full backup:",
    "",
    "- `library/` — your decks and flashcards as Markdown, readable anywhere.",
    "- `armin.db` — a complete SQLite snapshot of this profile.",
    "- `media/` — image files referenced by your flashcards.",
    "- `manifest.json` — metadata Armin uses to restore this archive.",
    "",
    "To restore, open Armin's profile picker and choose **Restore from backup**,",
    "then select this `.zip`. Restoring creates a new profile and never touches",
    "your existing data.",
    "",
  ].join("\n");
}

function appVersion(): string {
  // `app` is undefined outside Electron (e.g. unit tests); fall back gracefully.
  try {
    return app?.getVersion?.() ?? "unknown";
  } catch {
    return "unknown";
  }
}

type RenderIndex = {
  tagsByFlashcard: Map<string, string[]>;
  prereqIdsByDependent: Map<string, string[]>;
  reviewUnitsByFlashcard: Map<string, ReviewUnit[]>;
  refByFlashcard: Map<string, string>;
};

function renderReadme(
  profileName: string,
  now: Date,
  deckSummaries: { name: string; link: string; count: number }[],
  flashcardCount: number,
): string {
  const lines: string[] = [];
  lines.push(`# ${profileName} — Armin export`);
  lines.push("");
  lines.push(`Exported ${now.toISOString()}.`);
  lines.push("");
  lines.push(
    `${deckSummaries.length} deck${deckSummaries.length === 1 ? "" : "s"}, ` +
      `${flashcardCount} flashcard${flashcardCount === 1 ? "" : "s"}.`,
  );
  lines.push("");
  if (deckSummaries.length > 0) {
    lines.push("## Decks");
    lines.push("");
    for (const deck of deckSummaries) {
      lines.push(
        `- [${deck.name}](${deck.link}) — ${deck.count} flashcard${
          deck.count === 1 ? "" : "s"
        }`,
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}

function renderDeckMarkdown(
  deck: Deck,
  deckFlashcards: Flashcard[],
  index: RenderIndex,
): string {
  const lines: string[] = [];
  lines.push(`# ${deck.name}`);
  lines.push("");
  if (deck.description) {
    lines.push(deck.description);
    lines.push("");
  }
  if (deckFlashcards.length === 0) {
    lines.push("_This deck has no flashcards._");
    lines.push("");
    return lines.join("\n");
  }

  deckFlashcards.forEach((flashcard, i) => {
    const { content, type } = safeParse(flashcard);
    lines.push("---");
    lines.push("");
    lines.push(`## ${i + 1}. ${oneLine(representativeFront(type, content), 100)}`);
    lines.push("");

    const meta: string[] = [];
    meta.push(`- **Type:** ${FLASHCARD_TYPE_LABELS[type]}`);
    const cardTags = index.tagsByFlashcard.get(flashcard.id) ?? [];
    if (cardTags.length > 0) {
      meta.push(`- **Tags:** ${cardTags.join(", ")}`);
    }
    const status: string[] = [];
    if (flashcard.locked) status.push("locked");
    if (flashcard.archived) status.push("archived");
    if (status.length > 0) meta.push(`- **Status:** ${status.join(", ")}`);

    const prereqIds = index.prereqIdsByDependent.get(flashcard.id) ?? [];
    if (prereqIds.length > 0) {
      const refs = prereqIds
        .map((id) => index.refByFlashcard.get(id) ?? id)
        .map((ref) => `  - ${ref}`);
      meta.push("- **Prerequisites:**");
      meta.push(...refs);
    }
    lines.push(...meta);
    lines.push("");

    lines.push(...renderContent(type, content));
    lines.push("");

    const units = index.reviewUnitsByFlashcard.get(flashcard.id) ?? [];
    lines.push(...renderScheduling(units));
    lines.push("");
  });

  return lines.join("\n");
}

function renderContent(
  type: FlashcardType,
  content: FlashcardContent,
): string[] {
  switch (type) {
    case "basic":
    case "basic_reversed": {
      const c = content as BasicContent;
      return [
        "**Front**", "", rewriteMarkdownMediaForExport(c.front), "",
        "**Back**", "", rewriteMarkdownMediaForExport(c.back),
      ];
    }
    case "type_answer": {
      const c = content as TypeAnswerContent;
      const lines = [
        "**Prompt**",
        "",
        rewriteMarkdownMediaForExport(c.prompt),
        "",
        "**Answer**",
        "",
        c.answer,
      ];
      if (c.acceptedAnswers.length > 0) {
        lines.push("", `**Accepted answers:** ${c.acceptedAnswers.join(", ")}`);
      }
      return lines;
    }
    case "cloze": {
      const c = content as ClozeContent;
      return ["**Cloze**", "", rewriteMarkdownMediaForExport(c.text)];
    }
    case "image_occlusion": {
      const c = content as ImageOcclusionContent;
      const lines: string[] = [];
      if (c.header) {
        lines.push(
          "**Header**",
          "",
          rewriteMarkdownMediaForExport(c.header),
          "",
        );
      }
      if (isMediaRef(c.baseImage)) {
        lines.push(
          `![Image occlusion](../../media/${mediaFileNameFromRef(c.baseImage)})`,
          "",
        );
      }
      lines.push(`**Image occlusion** — ${c.masks.length} mask(s)`);
      const labelled = c.masks
        .map((m) => m.label)
        .filter((l): l is string => Boolean(l));
      if (labelled.length > 0) {
        lines.push("", ...labelled.map((l) => `- ${l}`));
      }
      if (c.extra) {
        lines.push("", "**Extra**", "", rewriteMarkdownMediaForExport(c.extra));
      }
      return lines;
    }
  }
}

function renderScheduling(units: ReviewUnit[]): string[] {
  if (units.length === 0) {
    return ["_No scheduling data._"];
  }
  const lines = ["**Scheduling**", ""];
  lines.push("| Unit | State | Due | Stability | Difficulty | Reps | Lapses |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const unit of units) {
    lines.push(
      `| ${unit.subKey || "—"} | ${stateLabel(unit.state)} | ${unit.due.toISOString()} | ` +
        `${round(unit.stability)} | ${round(unit.difficulty)} | ${unit.reps} | ${unit.lapses} |`,
    );
  }
  return lines;
}

// --- helpers ---

function safeParse(flashcard: Flashcard): {
  type: FlashcardType;
  content: FlashcardContent;
} {
  return parseStoredContent(flashcard.type, flashcard.content);
}

function representativeFront(
  type: FlashcardType,
  content: FlashcardContent,
): string {
  switch (type) {
    case "basic":
    case "basic_reversed":
      return (content as BasicContent).front;
    case "type_answer":
      return (content as TypeAnswerContent).prompt;
    case "cloze":
      return (content as ClozeContent).text;
    case "image_occlusion": {
      const c = content as ImageOcclusionContent;
      return c.header ?? `Image occlusion (${c.masks.length} masks)`;
    }
  }
}

function oneLine(text: string, max: number): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > max ? `${collapsed.slice(0, max - 1)}…` : collapsed;
}

function round(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
}

function isoDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function uniqueFileName(deckName: string, used: Set<string>): string {
  const base = slugify(deckName) || "deck";
  let candidate = `${base}.md`;
  let n = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${n}.md`;
    n += 1;
  }
  used.add(candidate);
  return candidate;
}
