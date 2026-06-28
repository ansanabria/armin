/**
 * Card images round-trip through a single Markdown string (composer ⇄ stored ⇄
 * review renderer). Markdown has no native width syntax, so an explicit display
 * width is carried in the image **title** as a leading `w=<px>` token, e.g.
 * `![alt](armin-media:…png "w=320")` or `![alt](…png "w=320 Figure 1")`. The
 * clean media ref stays in the URL, so main-process media validation is
 * unaffected, and any human caption after the token is preserved verbatim.
 * These helpers are the single place that encodes/decodes that convention,
 * shared by the Tiptap editor node and the read-only react-markdown renderer.
 */

/** A standalone `w=<px>` token anywhere in the title (whitespace/edge bounded). */
const WIDTH_TOKEN_RE = /(?:^|\s)w=(\d+)(?=\s|$)/i;

/** Read the pixel width encoded in an image title, or null when absent. */
export function parseImageWidth(title: string | null | undefined): number | null {
  if (!title) return null;
  const match = WIDTH_TOKEN_RE.exec(title);
  if (!match) return null;
  const width = Number.parseInt(match[1], 10);
  return Number.isFinite(width) && width > 0 ? width : null;
}

/** Return the title with its width token removed (the human caption), if any. */
export function stripImageWidth(
  title: string | null | undefined,
): string | undefined {
  if (!title) return undefined;
  const caption = title.replace(WIDTH_TOKEN_RE, " ").replace(/\s+/g, " ").trim();
  return caption.length > 0 ? caption : undefined;
}

/**
 * Build the image title from a display width and an optional human caption,
 * keeping the width as a leading token. Returns undefined when there is nothing
 * to encode.
 */
export function formatImageTitle(
  width: number | null | undefined,
  caption: string | null | undefined,
): string | undefined {
  const rounded = width == null ? 0 : Math.round(width);
  const widthToken = rounded > 0 ? `w=${rounded}` : "";
  const text = caption?.trim() ?? "";
  const combined = [widthToken, text].filter(Boolean).join(" ");
  return combined.length > 0 ? combined : undefined;
}
