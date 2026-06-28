import { z } from "zod";

/**
 * Flashcard-type domain module.
 *
 * A "flashcard" is the authored unit; it carries a `type` and a type-specific
 * `content` object. Each flashcard generates one or more review units (rows in
 * the `review_units` table), keyed by a stable `subKey` so edits preserve FSRS
 * history for the parts that did not change.
 *
 * This module only depends on `zod` so it can be imported from the main process,
 * the renderer, and the MCP server alike.
 */

export const FLASHCARD_TYPES = [
  "basic",
  "basic_reversed",
  "cloze",
  "type_answer",
  "image_occlusion",
] as const;

export type FlashcardType = (typeof FLASHCARD_TYPES)[number];

export function isFlashcardType(value: string): value is FlashcardType {
  return (FLASHCARD_TYPES as readonly string[]).includes(value);
}

// --- Per-type content schemas ---

export const basicContentSchema = z.object({
  front: z.string().min(1),
  back: z.string().min(1),
});

const clozeContentSchema = z
  .object({ text: z.string().min(1) })
  .refine((c) => clozeClusters(c.text).length > 0, {
    message: "Cloze text must contain at least one {{…}} deletion.",
    path: ["text"],
  });

const typeAnswerContentSchema = z.object({
  prompt: z.string().min(1),
  answer: z.string().min(1),
  acceptedAnswers: z.array(z.string()).default([]),
});

const imageOcclusionGeometrySchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});

const imageOcclusionMaskSchema = z.object({
  id: z.string().min(1),
  geometry: imageOcclusionGeometrySchema,
  label: z.string().min(1).optional(),
  hint: z.string().optional(),
});

const imageOcclusionContentSchema = z.object({
  baseImage: z.string().min(1),
  masks: z.array(imageOcclusionMaskSchema).min(1),
  header: z.string().optional(),
  extra: z.string().optional(),
  revealMode: z.enum(["hide_all", "hide_one"]).default("hide_all"),
});

export type BasicContent = z.infer<typeof basicContentSchema>;
export type ClozeContent = z.infer<typeof clozeContentSchema>;
export type TypeAnswerContent = z.infer<typeof typeAnswerContentSchema>;
export type ImageOcclusionGeometry = z.infer<
  typeof imageOcclusionGeometrySchema
>;
export type ImageOcclusionMask = z.infer<typeof imageOcclusionMaskSchema>;
export type ImageOcclusionContent = z.infer<typeof imageOcclusionContentSchema>;

export type FlashcardContentByType = {
  basic: BasicContent;
  basic_reversed: BasicContent;
  cloze: ClozeContent;
  type_answer: TypeAnswerContent;
  image_occlusion: ImageOcclusionContent;
};

export type FlashcardContent = FlashcardContentByType[FlashcardType];

const contentSchemaByType = {
  basic: basicContentSchema,
  basic_reversed: basicContentSchema,
  cloze: clozeContentSchema,
  type_answer: typeAnswerContentSchema,
  image_occlusion: imageOcclusionContentSchema,
} as const;

function formatClozeDeletion(deletion: ClozeDeletion) {
  return deletion.hint
    ? `{{${deletion.cluster}::${deletion.answer}::${deletion.hint}}}`
    : `{{${deletion.cluster}::${deletion.answer}}}`;
}

/** Rewrite bare cloze deletions to explicit cluster numbers. */
export function normalizeClozeText(text: string): string {
  const deletions = parseClozes(text);
  let i = 0;
  return text.replace(new RegExp(CLOZE_RE.source, "g"), () =>
    formatClozeDeletion(deletions[i++]),
  );
}

function normalizeContent<T extends FlashcardType>(
  type: T,
  content: FlashcardContentByType[T],
): FlashcardContentByType[T] {
  if (type !== "cloze") return content;
  const cloze = content as ClozeContent;
  return {
    ...cloze,
    text: normalizeClozeText(cloze.text),
  } as FlashcardContentByType[T];
}

/** Validate and normalize a content object for the given type. */
export function validateContent<T extends FlashcardType>(
  type: T,
  content: unknown,
): FlashcardContentByType[T] {
  return normalizeContent(
    type,
    contentSchemaByType[type].parse(content) as FlashcardContentByType[T],
  );
}

/** Parse a stored JSON content string into a validated content object. */
export function parseStoredContent(
  type: string,
  raw: string,
): { type: FlashcardType; content: FlashcardContent } {
  if (!isFlashcardType(type)) {
    throw new Error(`Unknown flashcard type: ${type}`);
  }
  const parsed = JSON.parse(raw) as unknown;
  return { type, content: validateContent(type, parsed) };
}

export function serializeContent(content: FlashcardContent): string {
  return JSON.stringify(content);
}

// --- Cloze parsing ---
//
// Authoring syntax is a single `{{…}}` wrapper around the deleted span. The
// canonical form carries an explicit cluster number (the editor inserts it):
//   {{N::answer}}          — cluster N (reuse N to blank several deletions together)
//   {{N::answer::hint}}    — cluster N with a hint shown inside the blank
// A leading run of digits before the first `::` is read as the cluster number.
// Bare forms are still accepted as a fallback (e.g. hand-typed or agent-authored
// flashcards) and are auto-numbered in document order, starting one above the
// highest explicit cluster:
//   {{answer}}             — bare; cluster auto-assigned by position
//   {{answer::hint}}       — bare with a hint
//
// Explicit numbers are what keep a deletion's identity (and its generated review
// unit's FSRS history) stable across edits, so the editor never emits a bare form.

/** Matches any `{{…}}` wrapper; the body is parsed separately. */
const CLOZE_RE = /\{\{([\s\S]+?)\}\}/g;

export type ClozeDeletion = {
  cluster: number;
  answer: string;
  hint?: string;
};

type RawCloze = {
  /** Cluster pinned by the author, or null when it should be auto-assigned. */
  explicitCluster: number | null;
  answer: string;
  hint?: string;
};

/** Parse the inside of a `{{…}}` wrapper into its parts. */
function parseClozeBody(body: string): RawCloze {
  const sep = body.indexOf("::");
  if (sep === -1) {
    return { explicitCluster: null, answer: body };
  }
  const head = body.slice(0, sep);
  const rest = body.slice(sep + 2);
  if (/^\d+$/.test(head)) {
    const cluster = Number(head);
    const hintSep = rest.indexOf("::");
    if (hintSep === -1) {
      return { explicitCluster: cluster, answer: rest };
    }
    return {
      explicitCluster: cluster,
      answer: rest.slice(0, hintSep),
      hint: rest.slice(hintSep + 2) || undefined,
    };
  }
  return { explicitCluster: null, answer: head, hint: rest || undefined };
}

/** Extract every cloze deletion in document order, resolving cluster numbers. */
export function parseClozes(text: string): ClozeDeletion[] {
  const re = new RegExp(CLOZE_RE.source, "g");
  const raws: RawCloze[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    raws.push(parseClozeBody(match[1]));
  }
  const maxExplicitCluster = raws.reduce(
    (maxCluster, rawCloze) =>
      rawCloze.explicitCluster != null && rawCloze.explicitCluster > maxCluster
        ? rawCloze.explicitCluster
        : maxCluster,
    0,
  );
  let nextAutoCluster = maxExplicitCluster + 1;
  return raws.map((rawCloze) => ({
    cluster: rawCloze.explicitCluster ?? nextAutoCluster++,
    answer: rawCloze.answer,
    hint: rawCloze.hint,
  }));
}

/** Distinct cluster numbers present in the text, sorted ascending. */
export function clozeClusters(text: string): number[] {
  const clusters = new Set(
    parseClozes(text).map((deletion) => deletion.cluster),
  );
  return [...clusters].sort((a, b) => a - b);
}

function clozeBlank(hint?: string): string {
  return hint ? `[${hint}]` : "[…]";
}

/** Replace each `{{…}}` in document order, feeding `fn` the resolved deletion. */
function replaceClozes(
  text: string,
  fn: (deletion: ClozeDeletion) => string,
): string {
  const deletions = parseClozes(text);
  let deletionIndex = 0;
  return text.replace(new RegExp(CLOZE_RE.source, "g"), () =>
    fn(deletions[deletionIndex++]),
  );
}

/**
 * Render cloze text. When `blankCluster` is set, deletions in that cluster are
 * replaced with a blank and all other deletions are revealed as their answer;
 * when it is null, every deletion is revealed.
 */
export function renderClozeText(
  text: string,
  blankCluster: number | null,
): string {
  return replaceClozes(text, (d) =>
    blankCluster != null && d.cluster === blankCluster
      ? clozeBlank(d.hint)
      : d.answer,
  );
}

function renderAllClozesBlanked(text: string): string {
  return replaceClozes(text, (d) => clozeBlank(d.hint));
}

// --- Review-unit generation ---

export type ReviewUnitSpec = {
  subKey: string;
  front: string;
  back: string;
};

/** Generate the review units (cached display strings) a flashcard produces. */
export function generateReviewUnits(
  type: FlashcardType,
  content: FlashcardContent,
): ReviewUnitSpec[] {
  switch (type) {
    case "basic": {
      const basic = content as BasicContent;
      return [{ subKey: "", front: basic.front, back: basic.back }];
    }
    case "basic_reversed": {
      const basic = content as BasicContent;
      return [
        { subKey: "", front: basic.front, back: basic.back },
        { subKey: "rev", front: basic.back, back: basic.front },
      ];
    }
    case "cloze": {
      const cloze = content as ClozeContent;
      return clozeClusters(cloze.text).map((cluster) => ({
        subKey: `c${cluster}`,
        front: renderClozeText(cloze.text, cluster),
        back: renderClozeText(cloze.text, null),
      }));
    }
    case "type_answer": {
      const typeAnswer = content as TypeAnswerContent;
      return [
        { subKey: "", front: typeAnswer.prompt, back: typeAnswer.answer },
      ];
    }
    case "image_occlusion": {
      const imageOcclusion = content as ImageOcclusionContent;
      return imageOcclusion.masks.map((mask) => ({
        subKey: mask.id,
        front:
          [imageOcclusion.header, mask.hint ? `Hint: ${mask.hint}` : null]
            .filter(Boolean)
            .join("\n\n") || "Recall the hidden area.",
        back: mask.label ?? "Hidden area",
      }));
    }
  }
}

/** Representative front/back for list tiles and graph nodes. */
export function flashcardDisplay(
  type: FlashcardType,
  content: FlashcardContent,
): { front: string; back: string } {
  switch (type) {
    case "basic":
    case "basic_reversed": {
      const basic = content as BasicContent;
      return { front: basic.front, back: basic.back };
    }
    case "cloze": {
      const cloze = content as ClozeContent;
      return {
        front: renderAllClozesBlanked(cloze.text),
        back: renderClozeText(cloze.text, null),
      };
    }
    case "type_answer": {
      const typeAnswer = content as TypeAnswerContent;
      return { front: typeAnswer.prompt, back: typeAnswer.answer };
    }
    case "image_occlusion": {
      const imageOcclusion = content as ImageOcclusionContent;
      const count = imageOcclusion.masks.length;
      return {
        front: `Image occlusion · ${count} mask${count === 1 ? "" : "s"}`,
        back: imageOcclusion.masks
          .map((mask) => mask.label)
          .filter(Boolean)
          .join(" · "),
      };
    }
  }
}

// --- type_answer matching ---

export function normalizeAnswer(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

/** Does a typed answer match the expected answer or an accepted alternative? */
export function matchesTypeAnswer(
  input: string,
  content: TypeAnswerContent,
): boolean {
  const normalized = normalizeAnswer(input);
  if (!normalized) return false;
  const candidates = [content.answer, ...content.acceptedAnswers];
  return candidates.some(
    (candidate) => normalizeAnswer(candidate) === normalized,
  );
}
