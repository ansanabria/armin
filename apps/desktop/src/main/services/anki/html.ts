/**
 * Convert the HTML that Anki stores in note fields into the Markdown that Armin
 * cards are authored and rendered in.
 *
 * Armin renders card content with react-markdown (GFM) and does **not** render
 * raw HTML, so anything we leave as a tag would show up as literal text or be
 * dropped. We therefore translate the common subset of HTML that Anki produces
 * (mostly `<div>` line breaks, `<b>/<i>`, lists, links and `<img>`) into
 * Markdown, and strip everything else down to its text.
 *
 * During package analysis, image filenames can resolve to temporary `data:`
 * URLs. Commit converts those URLs into profile-owned Flashcard media before
 * persisting flashcard content.
 */

/** Named HTML entities that show up in real Anki decks. */
const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  times: "×",
  deg: "°",
};

export function decodeEntities(input: string): string {
  return input.replace(
    /&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g,
    (match, body: string) => {
      if (body[0] === "#") {
        const codePoint =
          body[1] === "x" || body[1] === "X"
            ? parseInt(body.slice(2), 16)
            : parseInt(body.slice(1), 10);
        if (Number.isNaN(codePoint)) return match;
        try {
          return String.fromCodePoint(codePoint);
        } catch {
          return match;
        }
      }
      const named = NAMED_ENTITIES[body];
      return named ?? match;
    },
  );
}

type Token =
  | { kind: "text"; value: string }
  | { kind: "open" | "close" | "void"; tag: string; attrs: string };

const TAG_RE =
  /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
const VOID_TAGS = new Set(["br", "hr", "img", "input", "wbr"]);

function tokenize(html: string): Token[] {
  const tokens: Token[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  TAG_RE.lastIndex = 0;
  while ((match = TAG_RE.exec(html))) {
    if (match.index > last) {
      tokens.push({ kind: "text", value: html.slice(last, match.index) });
    }
    const [, slash, rawTag, attrs, selfClose] = match;
    const tag = rawTag.toLowerCase();
    if (slash) {
      tokens.push({ kind: "close", tag, attrs: "" });
    } else if (selfClose || VOID_TAGS.has(tag)) {
      tokens.push({ kind: "void", tag, attrs });
    } else {
      tokens.push({ kind: "open", tag, attrs });
    }
    last = TAG_RE.lastIndex;
  }
  if (last < html.length) {
    tokens.push({ kind: "text", value: html.slice(last) });
  }
  return tokens;
}

function getAttr(attrs: string, name: string): string | undefined {
  const re = new RegExp(
    `${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`,
    "i",
  );
  const m = attrs.match(re);
  if (!m) return undefined;
  return decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
}

const BLOCK_TAGS = new Set([
  "div",
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "blockquote",
  "table",
  "tr",
  "section",
  "article",
  "header",
  "footer",
]);

export type AnkiHtmlOptions = {
  /** Resolve a media filename (e.g. `img.png`) to an inline `data:` URL. */
  resolveMedia?: (filename: string) => string | undefined;
};

/**
 * A frame on the output stack. Most content accumulates into the root frame;
 * links push a frame so their inner text can be wrapped as `[text](href)`.
 */
type Frame = { buffer: string; onClose: (inner: string) => string };

export function ankiHtmlToMarkdown(
  html: string,
  options: AnkiHtmlOptions = {},
): string {
  if (!html) return "";

  // Drop audio/video references Armin can't play, plus Anki's TTS markup.
  let source = html.replace(/\[sound:[^\]]*\]/g, "");
  source = source.replace(/\[anki:tts[^\]]*\]/g, "");

  const tokens = tokenize(source);
  const stack: Frame[] = [{ buffer: "", onClose: (s) => s }];
  // Tracks the ordered-list counter for each open list (null = unordered).
  const listStack: Array<number | null> = [];

  const top = () => stack[stack.length - 1];
  const emit = (text: string) => {
    top().buffer += text;
  };
  const ensureBlockBreak = () => {
    const buf = top().buffer;
    if (buf.length === 0 || buf.endsWith("\n")) return;
    emit("\n");
  };

  for (const token of tokens) {
    if (token.kind === "text") {
      // Collapse HTML whitespace (including newlines from pretty-printed HTML).
      const text = decodeEntities(token.value).replace(/\s+/g, " ");
      if (text) emit(text);
      continue;
    }

    const { tag } = token;

    if (token.kind === "void") {
      if (tag === "br") emit("\n");
      else if (tag === "hr") emit("\n\n---\n\n");
      else if (tag === "img") {
        const rawSrc = getAttr(token.attrs, "src") ?? "";
        const alt = getAttr(token.attrs, "alt") ?? "";
        const resolved = options.resolveMedia?.(rawSrc) ?? rawSrc;
        if (resolved) emit(`![${alt}](${resolved})`);
      }
      continue;
    }

    if (token.kind === "open") {
      switch (tag) {
        case "b":
        case "strong":
          emit("**");
          break;
        case "i":
        case "em":
          emit("*");
          break;
        case "del":
        case "s":
        case "strike":
          emit("~~");
          break;
        case "code":
          emit("`");
          break;
        case "pre":
          ensureBlockBreak();
          emit("\n```\n");
          break;
        case "a": {
          const href = getAttr(token.attrs, "href") ?? "";
          stack.push({
            buffer: "",
            onClose: (inner) =>
              href ? `[${inner.trim() || href}](${href})` : inner,
          });
          break;
        }
        case "ul":
          ensureBlockBreak();
          listStack.push(null);
          break;
        case "ol":
          ensureBlockBreak();
          listStack.push(1);
          break;
        case "li": {
          ensureBlockBreak();
          const counter = listStack[listStack.length - 1];
          if (typeof counter === "number") {
            emit(`${counter}. `);
            listStack[listStack.length - 1] = counter + 1;
          } else {
            emit("- ");
          }
          break;
        }
        case "h1":
        case "h2":
        case "h3":
        case "h4":
        case "h5":
        case "h6": {
          ensureBlockBreak();
          emit("\n" + "#".repeat(Number(tag[1])) + " ");
          break;
        }
        case "blockquote":
          ensureBlockBreak();
          emit("\n> ");
          break;
        default:
          if (BLOCK_TAGS.has(tag)) ensureBlockBreak();
      }
      continue;
    }

    // token.kind === "close"
    switch (tag) {
      case "b":
      case "strong":
        emit("**");
        break;
      case "i":
      case "em":
        emit("*");
        break;
      case "del":
      case "s":
      case "strike":
        emit("~~");
        break;
      case "code":
        emit("`");
        break;
      case "pre":
        emit("\n```\n");
        break;
      case "a": {
        if (stack.length > 1) {
          const frame = stack.pop()!;
          emit(frame.onClose(frame.buffer));
        }
        break;
      }
      case "ul":
      case "ol":
        listStack.pop();
        ensureBlockBreak();
        break;
      case "li":
        ensureBlockBreak();
        break;
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6":
      case "blockquote":
        ensureBlockBreak();
        break;
      default:
        if (BLOCK_TAGS.has(tag)) ensureBlockBreak();
    }
  }

  // Unwind any unclosed link frames.
  while (stack.length > 1) {
    const frame = stack.pop()!;
    top().buffer += frame.onClose(frame.buffer);
  }

  return cleanup(stack[0].buffer);
}

function cleanup(markdown: string): string {
  return (
    markdown
      // Drop emphasis markers that ended up wrapping nothing. The single-marker
      // rules require whitespace between so they can't eat adjacent `**` bold.
      .replace(/\*\*\s*\*\*/g, "")
      .replace(/\*\s+\*/g, "")
      .replace(/~~\s*~~/g, "")
      .replace(/`\s+`/g, "")
      // Trim trailing spaces on each line.
      .replace(/[ \t]+\n/g, "\n")
      // Collapse runs of blank lines.
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim()
  );
}
