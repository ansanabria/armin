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
    message: "Cloze text must contain at least one {{c1::…}} deletion.",
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

/** Matches {{c1::answer}} or {{c1::answer::hint}}; resets lastIndex on each use. */
const CLOZE_RE = /\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g;

export type ClozeDeletion = {
  cluster: number;
  answer: string;
  hint?: string;
};

/** Extract every cloze deletion in document order. */
export function parseClozes(text: string): ClozeDeletion[] {
  const deletions: ClozeDeletion[] = [];
  const re = new RegExp(CLOZE_RE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    deletions.push({
      cluster: Number(match[1]),
      answer: match[2],
      hint: match[3] || undefined,
    });
  }
  return deletions;
}

/** Distinct cluster numbers present in the text, sorted ascending. */
export function clozeClusters(text: string): number[] {
  const clusters = new Set(parseClozes(text).map((d) => d.cluster));
  return [...clusters].sort((a, b) => a - b);
}

function clozeBlank(hint?: string): string {
  return hint ? `[${hint}]` : "[…]";
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
  return text.replace(
    new RegExp(CLOZE_RE.source, "g"),
    (_full, num: string, answer: string, hint?: string) => {
      const cluster = Number(num);
      if (blankCluster != null && cluster === blankCluster) {
        return clozeBlank(hint);
      }
      return answer;
    },
  );
}

function renderAllClozesBlanked(text: string): string {
  return text.replace(
    new RegExp(CLOZE_RE.source, "g"),
    (_full, _num: string, _answer: string, hint?: string) => clozeBlank(hint),
  );
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
