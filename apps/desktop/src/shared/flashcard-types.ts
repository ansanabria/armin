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

export type BasicContent = {
  front: string;
  back: string;
};

export type ClozeContent = {
  text: string;
};

export type TypeAnswerContent = {
  prompt: string;
  answer: string;
  acceptedAnswers: string[];
};

export type ImageOcclusionGeometry = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type ImageOcclusionMask = {
  id: string;
  geometry: ImageOcclusionGeometry;
  label?: string;
  hint?: string;
};

export type ImageOcclusionContent = {
  baseImage: string;
  masks: ImageOcclusionMask[];
  header?: string;
  extra?: string;
  revealMode: "hide_all" | "hide_one";
};

export type FlashcardContentByType = {
  basic: BasicContent;
  basic_reversed: BasicContent;
  cloze: ClozeContent;
  type_answer: TypeAnswerContent;
  image_occlusion: ImageOcclusionContent;
};

export type FlashcardContent = FlashcardContentByType[FlashcardType];

/** Matches any `{{...}}` wrapper; the body is parsed separately. */
const CLOZE_RE = /\{\{([\s\S]+?)\}\}/g;

export type ClozeDeletion = {
  cluster: number;
  answer: string;
  hint?: string;
};

type RawCloze = {
  explicitCluster: number | null;
  answer: string;
  hint?: string;
};

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

export function clozeClusters(text: string): number[] {
  const clusters = new Set(
    parseClozes(text).map((deletion) => deletion.cluster),
  );
  return [...clusters].sort((a, b) => a - b);
}

export function normalizeAnswer(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

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
