/**
 * Parse a markdown deck export into cards for the import preview.
 *
 * Format (intentionally forgiving):
 *   - Cards are separated by a horizontal rule line (`---`, three or more).
 *   - Within a card, the front and back are split by a line that is only `::`.
 *   - An optional `Tags: a, b, c` line attaches free-form tags.
 *
 * Example:
 *   What does `typeof null` return?
 *   ::
 *   `"object"` — a historical bug kept for compatibility.
 *   Tags: types, gotchas
 *   ---
 *   What is a closure?
 *   ::
 *   A function bundled with its surrounding lexical scope.
 *
 * UI preview: a real importer would live in the main process. This mirrors the
 * shape closely enough that wiring the backend later is a source swap.
 */
export type ParsedCard = {
  front: string;
  back: string;
  tags: string[];
};

export type ParsedDeck = {
  cards: ParsedCard[];
  /** Blocks that looked like cards but were missing a front or back. */
  skipped: number;
};

const CARD_SEPARATOR = /^\s*-{3,}\s*$/m;
const FIELD_SEPARATOR = /^\s*::\s*$/m;
const TAGS_LINE = /^\s*tags:\s*(.+)$/im;

export function parseMarkdownDeck(input: string): ParsedDeck {
  const cards: ParsedCard[] = [];
  let skipped = 0;

  for (const rawBlock of input.split(CARD_SEPARATOR)) {
    const block = rawBlock.trim();
    if (!block) continue;

    let tags: string[] = [];
    const tagMatch = block.match(TAGS_LINE);
    let body = block;
    if (tagMatch) {
      tags = tagMatch[1]
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      body = block.replace(tagMatch[0], "").trim();
    }

    if (!FIELD_SEPARATOR.test(body)) {
      skipped++;
      continue;
    }

    const [frontRaw, ...rest] = body.split(FIELD_SEPARATOR);
    const front = frontRaw.trim();
    const back = rest.join("\n").trim();
    if (!front || !back) {
      skipped++;
      continue;
    }

    cards.push({ front, back, tags });
  }

  return { cards, skipped };
}
