import { z } from "zod";

/**
 * Card-type domain module.
 *
 * A "note" is the authored unit; it carries a `type` and a type-specific
 * `content` object. Each note generates one or more review items (rows in the
 * `cards` table), keyed by a stable `subKey` so edits preserve FSRS history for
 * the parts that did not change.
 *
 * This module only depends on `zod` so it can be imported from the main process,
 * the renderer, and the MCP server alike.
 */

export const CARD_TYPES = [
  "basic",
  "basic_reversed",
  "cloze",
  "type_answer",
  "diagram",
] as const;

export type CardType = (typeof CARD_TYPES)[number];

export function isCardType(value: string): value is CardType {
  return (CARD_TYPES as readonly string[]).includes(value);
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

const diagramRegionSchema = z.object({
  id: z.string().min(1),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  label: z.string().min(1),
  hint: z.string().optional(),
});

const diagramContentSchema = z.object({
  image: z.string().min(1),
  regions: z.array(diagramRegionSchema).min(1),
});

export type BasicContent = z.infer<typeof basicContentSchema>;
export type ClozeContent = z.infer<typeof clozeContentSchema>;
export type TypeAnswerContent = z.infer<typeof typeAnswerContentSchema>;
export type DiagramRegion = z.infer<typeof diagramRegionSchema>;
export type DiagramContent = z.infer<typeof diagramContentSchema>;

export type CardContentByType = {
  basic: BasicContent;
  basic_reversed: BasicContent;
  cloze: ClozeContent;
  type_answer: TypeAnswerContent;
  diagram: DiagramContent;
};

export type CardContent = CardContentByType[CardType];

/** A `{ type, content }` pair, validated as a discriminated union. */
export type TypedNoteContent = {
  [K in CardType]: { type: K; content: CardContentByType[K] };
}[CardType];

export const typedNoteContentSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("basic"), content: basicContentSchema }),
  z.object({ type: z.literal("basic_reversed"), content: basicContentSchema }),
  z.object({ type: z.literal("cloze"), content: clozeContentSchema }),
  z.object({
    type: z.literal("type_answer"),
    content: typeAnswerContentSchema,
  }),
  z.object({ type: z.literal("diagram"), content: diagramContentSchema }),
]);

const contentSchemaByType = {
  basic: basicContentSchema,
  basic_reversed: basicContentSchema,
  cloze: clozeContentSchema,
  type_answer: typeAnswerContentSchema,
  diagram: diagramContentSchema,
} as const;

/** Validate and normalize a content object for the given type. */
export function validateContent<T extends CardType>(
  type: T,
  content: unknown,
): CardContentByType[T] {
  return contentSchemaByType[type].parse(content) as CardContentByType[T];
}

/** Parse a stored JSON content string into a validated content object. */
export function parseStoredContent(
  type: string,
  raw: string,
): { type: CardType; content: CardContent } {
  if (!isCardType(type)) {
    throw new Error(`Unknown card type: ${type}`);
  }
  const parsed = JSON.parse(raw) as unknown;
  return { type, content: validateContent(type, parsed) };
}

export function serializeContent(content: CardContent): string {
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
// notes) and are auto-numbered in document order, starting one above the highest
// explicit cluster:
//   {{answer}}             — bare; cluster auto-assigned by position
//   {{answer::hint}}       — bare with a hint
//
// Explicit numbers are what keep a deletion's identity (and its generated card's
// FSRS history) stable across edits, so the editor never emits a bare form.

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
  const maxExplicit = raws.reduce(
    (max, r) =>
      r.explicitCluster != null && r.explicitCluster > max
        ? r.explicitCluster
        : max,
    0,
  );
  let nextAuto = maxExplicit + 1;
  return raws.map((r) => ({
    cluster: r.explicitCluster ?? nextAuto++,
    answer: r.answer,
    hint: r.hint,
  }));
}

/** Distinct cluster numbers present in the text, sorted ascending. */
export function clozeClusters(text: string): number[] {
  const clusters = new Set(parseClozes(text).map((d) => d.cluster));
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
  let i = 0;
  return text.replace(new RegExp(CLOZE_RE.source, "g"), () =>
    fn(deletions[i++]),
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

// --- Review-item generation ---

export type ReviewItem = {
  subKey: string;
  front: string;
  back: string;
};

/** Generate the review items (cached display strings) a note produces. */
export function generateReviewItems(
  type: CardType,
  content: CardContent,
): ReviewItem[] {
  switch (type) {
    case "basic": {
      const c = content as BasicContent;
      return [{ subKey: "", front: c.front, back: c.back }];
    }
    case "basic_reversed": {
      const c = content as BasicContent;
      return [
        { subKey: "fwd", front: c.front, back: c.back },
        { subKey: "rev", front: c.back, back: c.front },
      ];
    }
    case "cloze": {
      const c = content as ClozeContent;
      return clozeClusters(c.text).map((cluster) => ({
        subKey: `c${cluster}`,
        front: renderClozeText(c.text, cluster),
        back: renderClozeText(c.text, null),
      }));
    }
    case "type_answer": {
      const c = content as TypeAnswerContent;
      return [{ subKey: "", front: c.prompt, back: c.answer }];
    }
    case "diagram": {
      const c = content as DiagramContent;
      return c.regions.map((region) => ({
        subKey: region.id,
        front: region.hint
          ? `Identify the highlighted region — ${region.hint}`
          : "Identify the highlighted region",
        back: region.label,
      }));
    }
  }
}

/** Representative front/back for list tiles and graph nodes. */
export function noteDisplay(
  type: CardType,
  content: CardContent,
): { front: string; back: string } {
  switch (type) {
    case "basic":
    case "basic_reversed": {
      const c = content as BasicContent;
      return { front: c.front, back: c.back };
    }
    case "cloze": {
      const c = content as ClozeContent;
      return {
        front: renderAllClozesBlanked(c.text),
        back: renderClozeText(c.text, null),
      };
    }
    case "type_answer": {
      const c = content as TypeAnswerContent;
      return { front: c.prompt, back: c.answer };
    }
    case "diagram": {
      const c = content as DiagramContent;
      const count = c.regions.length;
      return {
        front: `Diagram · ${count} region${count === 1 ? "" : "s"}`,
        back: c.regions.map((r) => r.label).join(" · "),
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
  return candidates.some((c) => normalizeAnswer(c) === normalized);
}

/** Convenience for the simple two-field create paths (Anki / Markdown import). */
export function basicNote(front: string, back: string): TypedNoteContent {
  return { type: "basic", content: { front, back } };
}
