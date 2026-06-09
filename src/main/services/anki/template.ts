/**
 * Render Anki note types into per-card front/back HTML.
 *
 * Anki cards are produced by running a note's fields through a "mustache"-style
 * template (`qfmt`/`afmt`) that supports field substitution, `{{FrontSide}}`,
 * `{{#Field}}`/`{{^Field}}` conditionals and a handful of field filters. Cloze
 * note types instead blank out `{{cN::answer}}` markers per card.
 *
 * The output here is still HTML — callers run it through `ankiHtmlToMarkdown`
 * to land on Armin's Markdown card content.
 */

export type AnkiFields = Record<string, string>;

/** Crude "does this field have visible content" test, matching Anki closely. */
function fieldIsEmpty(value: string | undefined): boolean {
  if (!value) return true;
  return stripHtmlToText(value).trim() === "";
}

export function stripHtmlToText(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Resolve `{{#Field}}…{{/Field}}` and `{{^Field}}…{{/Field}}` sections. */
function resolveSections(template: string, fields: AnkiFields): string {
  const SECTION = /\{\{([#^])([^}]+)\}\}([\s\S]*?)\{\{\/\2\}\}/;
  let out = template;
  // Repeatedly collapse the innermost matchable section until none remain.
  for (let guard = 0; guard < 100; guard++) {
    const match = SECTION.exec(out);
    if (!match) break;
    const [whole, kind, rawName, inner] = match;
    const empty = fieldIsEmpty(fields[rawName.trim()]);
    const keep = kind === "#" ? !empty : empty;
    out = out.slice(0, match.index) + (keep ? inner : "") + out.slice(match.index + whole.length);
  }
  return out;
}

/**
 * Substitute `{{Field}}` tokens (and known filters) in a template that has
 * already had its conditional sections resolved.
 */
export function renderTemplate(
  template: string,
  fields: AnkiFields,
  frontSide = "",
): string {
  const resolved = resolveSections(template, fields);
  return resolved.replace(/\{\{([^}]+)\}\}/g, (_whole, rawInner: string) => {
    const inner = rawInner.trim();
    if (inner === "FrontSide") return frontSide;

    const parts = inner.split(":").map((p) => p.trim());
    const field = parts[parts.length - 1];
    const filters = parts.slice(0, -1).map((f) => f.toLowerCase());

    // Text-to-speech markup has no visual content.
    if (filters.some((f) => f.startsWith("tts"))) return "";

    const value = fields[field] ?? "";
    if (filters.includes("text")) return stripHtmlToText(value);
    if (filters.includes("cloze")) return revealClozes(value);
    return value;
  });
}

const CLOZE_RE = /\{\{c(\d+)::([\s\S]*?)\}\}/g;

/** Reveal every cloze in a field, dropping the markers (used outside cloze cards). */
function revealClozes(text: string): string {
  return text.replace(CLOZE_RE, (_w, _n, body: string) => clozeAnswer(body));
}

/** A cloze body is `answer` or `answer::hint`; we keep the answer. */
function clozeAnswer(body: string): string {
  const sep = body.indexOf("::");
  return sep === -1 ? body : body.slice(0, sep);
}

function clozeHint(body: string): string | null {
  const sep = body.indexOf("::");
  return sep === -1 ? null : body.slice(sep + 2);
}

/** True if a field contains cloze markers, i.e. belongs to a cloze note. */
export function hasClozeMarkers(text: string): boolean {
  CLOZE_RE.lastIndex = 0;
  return /\{\{c\d+::/.test(text);
}

/** The distinct cloze numbers present in a field, in ascending order. */
export function clozeNumbers(text: string): number[] {
  const found = new Set<number>();
  let m: RegExpExecArray | null;
  CLOZE_RE.lastIndex = 0;
  while ((m = CLOZE_RE.exec(text))) found.add(Number(m[1]));
  return [...found].sort((a, b) => a - b);
}

/**
 * Render one cloze card (1-based `clozeNumber`): the matching deletions are
 * blanked on the front and revealed (bold) on the back; other clozes show
 * their answer on both sides.
 */
export function renderCloze(
  text: string,
  clozeNumber: number,
): { front: string; back: string } {
  const front = text.replace(CLOZE_RE, (_w, n: string, body: string) => {
    if (Number(n) === clozeNumber) {
      const hint = clozeHint(body);
      return `[${hint ?? "..."}]`;
    }
    return clozeAnswer(body);
  });
  const back = text.replace(CLOZE_RE, (_w, n: string, body: string) => {
    const answer = clozeAnswer(body);
    return Number(n) === clozeNumber ? `<b>${answer}</b>` : answer;
  });
  return { front, back };
}
