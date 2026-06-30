import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { profileMediaDir, schema } from "../db";
import type { Flashcard } from "../db/schema";
import type { ServiceContext } from "./context";
import {
  isMediaRef,
  isSafeMediaFileName,
  mediaRefFromFileName,
  replaceMediaRefs,
} from "../../shared/media-ref";
import {
  parseStoredContent,
  serializeContent,
  type FlashcardContent,
  type FlashcardType,
  type ImageOcclusionContent,
} from "./flashcard-types";

export const MAX_MEDIA_BYTES = 25 * 1024 * 1024;

const DATA_IMAGE_RE =
  /data:image\/([a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)/g;
const MARKDOWN_IMAGE_RE = /!\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^)]*["'])?\)/g;
const HTML_IMAGE_SRC_RE = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;

type ImageKind = {
  ext: "png" | "jpg" | "gif" | "webp" | "svg" | "bmp" | "avif";
  mime: string;
};

const MIME_BY_EXT: Record<ImageKind["ext"], string> = {
  png: "image/png",
  jpg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  avif: "image/avif",
};

const EXT_BY_MIME: Record<string, ImageKind["ext"]> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/bmp": "bmp",
  "image/avif": "avif",
};

export type StoredMedia = {
  ref: string;
  fileName: string;
  mime: string;
  bytes: number;
};

export function mimeForMediaFile(fileName: string): string | undefined {
  if (!isSafeMediaFileName(fileName)) return undefined;
  const ext = path.extname(fileName).slice(1) as ImageKind["ext"];
  return MIME_BY_EXT[ext];
}

export function mediaPath(profileId: string, fileName: string): string {
  if (!isSafeMediaFileName(fileName)) {
    throw new Error("Invalid Flashcard media filename.");
  }
  return path.join(profileMediaDir(profileId), fileName);
}

export function storeFlashcardMedia(input: {
  profileId: string;
  bytes: Uint8Array;
  fileName?: string;
  mime?: string;
}): StoredMedia {
  assertMediaSize(input.bytes);
  const kind = detectImageKind(input.bytes, input.fileName, input.mime);
  const hash = createHash("sha256").update(input.bytes).digest("hex");
  const fileName = `${hash}.${kind.ext}`;
  const dir = profileMediaDir(input.profileId);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, fileName);
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, input.bytes);
  }
  return {
    ref: mediaRefFromFileName(fileName),
    fileName,
    mime: kind.mime,
    bytes: input.bytes.byteLength,
  };
}

export function writeRestoredMediaFile(
  profileId: string,
  fileName: string,
  bytes: Uint8Array,
) {
  if (!isSafeMediaFileName(fileName)) return;
  assertMediaSize(bytes);
  const detected = detectImageKind(bytes, fileName);
  const expectedMime = mimeForMediaFile(fileName);
  if (expectedMime !== detected.mime) {
    throw new Error(`Backup media file ${fileName} has the wrong image type.`);
  }
  const dir = profileMediaDir(profileId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, fileName), bytes);
}

export function listProfileMediaFiles(profileId: string): string[] {
  const dir = profileMediaDir(profileId);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(isSafeMediaFileName)
    .sort((a, b) => a.localeCompare(b));
}

export function readProfileMediaFile(
  profileId: string,
  fileName: string,
): Uint8Array {
  return fs.readFileSync(mediaPath(profileId, fileName));
}

export function assertContentUsesMediaRefs(
  type: FlashcardType,
  content: FlashcardContent,
) {
  const markdownFields = markdownFieldsFor(type, content);
  for (const field of markdownFields) {
    assertMarkdownImageRefs(field);
  }
  if (type === "image_occlusion") {
    const c = content as ImageOcclusionContent;
    assertMediaRef(c.baseImage, "Image occlusion base image");
  }
}

export function rewriteMarkdownMediaForExport(markdown: string): string {
  return replaceMediaRefs(markdown, (_ref, fileName) => `../../media/${fileName}`);
}

export function canonicalizeLegacyMediaInContent(
  profileId: string,
  type: FlashcardType,
  content: FlashcardContent,
): { content: FlashcardContent; changed: boolean } {
  let changed = false;
  const replace = (text: string) =>
    text.replace(DATA_IMAGE_RE, (dataUrl, rawSubtype: string, base64: string) => {
      changed = true;
      const bytes = Buffer.from(base64, "base64");
      const stored = storeFlashcardMedia({
        profileId,
        bytes,
        mime: `image/${rawSubtype.toLowerCase()}`,
      });
      return stored.ref;
    });

  switch (type) {
    case "basic":
    case "basic_reversed": {
      const c = content as { front: string; back: string };
      const next = {
        ...c,
        front: replace(c.front),
        back: replace(c.back),
      };
      return { changed, content: next };
    }
    case "cloze": {
      const c = content as { text: string };
      const next = { ...c, text: replace(c.text) };
      return { changed, content: next };
    }
    case "type_answer": {
      const c = content as {
        prompt: string;
        answer: string;
        acceptedAnswers: string[];
      };
      const next = { ...c, prompt: replace(c.prompt) };
      return { changed, content: next };
    }
    case "image_occlusion": {
      const c = content as ImageOcclusionContent;
      const next: ImageOcclusionContent = {
        ...c,
        baseImage: replace(c.baseImage),
        header: c.header ? replace(c.header) : c.header,
        extra: c.extra ? replace(c.extra) : c.extra,
      };
      return { changed, content: next };
    }
  }
}

export function canonicalizeLegacyMediaForWrite(
  profileId: string,
  type: FlashcardType,
  content: FlashcardContent,
): FlashcardContent {
  const result = canonicalizeLegacyMediaInContent(profileId, type, content);
  return result.content;
}

export async function upgradeLegacyFlashcardMedia(ctx: ServiceContext) {
  const rows = ctx.db.select().from(schema.flashcards).all();
  const updates: { flashcard: Flashcard; content: FlashcardContent }[] = [];
  for (const flashcard of rows) {
    const parsed = parseStoredContent(flashcard.type, flashcard.content);
    const { content, changed } = canonicalizeLegacyMediaInContent(
      ctx.profileId,
      parsed.type,
      parsed.content,
    );
    if (changed) updates.push({ flashcard, content });
  }
  if (updates.length === 0) return;
  ctx.db.transaction((tx) => {
    for (const update of updates) {
      tx.update(schema.flashcards)
        .set({
          content: serializeContent(update.content),
          updatedAt: update.flashcard.updatedAt,
        })
        .where(eq(schema.flashcards.id, update.flashcard.id))
        .run();
    }
  });
}

function assertMediaSize(bytes: Uint8Array) {
  if (bytes.byteLength === 0) {
    throw new Error("Flashcard media file is empty.");
  }
  if (bytes.byteLength > MAX_MEDIA_BYTES) {
    throw new Error("Flashcard media files must be 25 MiB or smaller.");
  }
}

function detectImageKind(
  bytes: Uint8Array,
  fileName?: string,
  mime?: string,
): ImageKind {
  const sniffed = sniffImageKind(bytes);
  if (sniffed) return sniffed;

  const mimeExt = mime ? EXT_BY_MIME[mime.toLowerCase()] : undefined;
  if (mimeExt) return { ext: mimeExt, mime: MIME_BY_EXT[mimeExt] };

  const ext = extensionFromFileName(fileName);
  if (ext) return { ext, mime: MIME_BY_EXT[ext] };

  throw new Error(
    "Unsupported Flashcard media image type. Use PNG, JPG, GIF, WebP, SVG, BMP, or AVIF.",
  );
}

function sniffImageKind(bytes: Uint8Array): ImageKind | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) {
    return { ext: "png", mime: "image/png" };
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return { ext: "jpg", mime: "image/jpeg" };
  }
  if (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a") {
    return { ext: "gif", mime: "image/gif" };
  }
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    return { ext: "webp", mime: "image/webp" };
  }
  if (startsWith(bytes, [0x42, 0x4d])) {
    return { ext: "bmp", mime: "image/bmp" };
  }
  if (ascii(bytes, 4, 4) === "ftyp" && ascii(bytes, 8, 4).startsWith("avif")) {
    return { ext: "avif", mime: "image/avif" };
  }
  const head = Buffer.from(bytes.slice(0, 512)).toString("utf8").trimStart();
  if (/^<svg[\s>]/i.test(head) || /^<\?xml[\s\S]*<svg[\s>]/i.test(head)) {
    return { ext: "svg", mime: "image/svg+xml" };
  }
  return null;
}

function startsWith(bytes: Uint8Array, prefix: number[]) {
  return prefix.every((byte, index) => bytes[index] === byte);
}

function ascii(bytes: Uint8Array, start: number, length: number) {
  return Buffer.from(bytes.slice(start, start + length)).toString("ascii");
}

function extensionFromFileName(fileName?: string): ImageKind["ext"] | undefined {
  const ext = fileName?.split(".").pop()?.toLowerCase();
  if (!ext) return undefined;
  if (ext === "jpeg") return "jpg";
  return (Object.keys(MIME_BY_EXT) as ImageKind["ext"][]).find((e) => e === ext);
}

function markdownFieldsFor(
  type: FlashcardType,
  content: FlashcardContent,
): string[] {
  switch (type) {
    case "basic":
    case "basic_reversed": {
      const c = content as { front: string; back: string };
      return [c.front, c.back];
    }
    case "cloze":
      return [(content as { text: string }).text];
    case "type_answer":
      return [(content as { prompt: string }).prompt];
    case "image_occlusion": {
      const c = content as ImageOcclusionContent;
      return [c.header, c.extra].filter((v): v is string => Boolean(v));
    }
  }
}

function assertMarkdownImageRefs(markdown: string) {
  for (const match of markdown.matchAll(MARKDOWN_IMAGE_RE)) {
    assertMediaRef(match[1], "Markdown images");
  }
  for (const match of markdown.matchAll(HTML_IMAGE_SRC_RE)) {
    assertMediaRef(match[1], "Markdown images");
  }
}

function assertMediaRef(value: string, label: string) {
  if (isMediaRef(value)) return;
  if (/^data:image\//i.test(value)) {
    throw new Error(`${label} must be imported into Flashcard media first.`);
  }
  throw new Error(`${label} must use armin-media:<sha256>.<ext> references.`);
}

export {
  isMediaRef,
  isSafeMediaFileName,
  mediaFileNameFromRef,
  mediaRefFromFileName,
} from "../../shared/media-ref";
