import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { profileMediaDir, schema } from "../db";
import type { Flashcard } from "../db/schema";
import type { ServiceContext } from "./context";
import {
  parseStoredContent,
  serializeContent,
  type FlashcardContent,
  type FlashcardType,
  type ImageOcclusionContent,
} from "./flashcard-types";

export const MEDIA_REF_PREFIX = "armin-media:";
export const MAX_MEDIA_BYTES = 25 * 1024 * 1024;

const MEDIA_FILE_RE = /^[a-f0-9]{64}\.(png|jpg|gif|webp|svg|bmp|avif)$/;
const MEDIA_REF_RE =
  /^armin-media:[a-f0-9]{64}\.(png|jpg|gif|webp|svg|bmp|avif)$/;
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

export function isMediaRef(value: string) {
  return MEDIA_REF_RE.test(value);
}

export function mediaFileNameFromRef(ref: string) {
  if (!isMediaRef(ref)) {
    throw new Error("Invalid Flashcard media reference.");
  }
  return ref.slice(MEDIA_REF_PREFIX.length);
}

export function mediaRefFromFileName(fileName: string) {
  if (!isSafeMediaFileName(fileName)) {
    throw new Error("Invalid Flashcard media filename.");
  }
  return `${MEDIA_REF_PREFIX}${fileName}`;
}

export function isSafeMediaFileName(fileName: string) {
  return MEDIA_FILE_RE.test(fileName);
}

export function mimeForMediaFile(fileName: string) {
  if (!isSafeMediaFileName(fileName)) return undefined;
  const extension = path.extname(fileName).slice(1) as ImageKind["ext"];
  return MIME_BY_EXT[extension];
}

export function mediaPath(profileId: string, fileName: string) {
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
}) {
  assertMediaSize(input.bytes);

  const imageKind = detectImageKind(input.bytes, input.fileName, input.mime);
  const hash = createHash("sha256").update(input.bytes).digest("hex");
  const fileName = `${hash}.${imageKind.ext}`;
  const mediaDir = profileMediaDir(input.profileId);
  const targetPath = path.join(mediaDir, fileName);

  fs.mkdirSync(mediaDir, { recursive: true });
  if (!fs.existsSync(targetPath)) {
    fs.writeFileSync(targetPath, input.bytes);
  }

  return {
    ref: mediaRefFromFileName(fileName),
    fileName,
    mime: imageKind.mime,
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

  const detectedKind = detectImageKind(bytes, fileName);
  const expectedMime = mimeForMediaFile(fileName);
  if (expectedMime !== detectedKind.mime) {
    throw new Error(`Backup media file ${fileName} has the wrong image type.`);
  }

  const mediaDir = profileMediaDir(profileId);
  fs.mkdirSync(mediaDir, { recursive: true });
  fs.writeFileSync(path.join(mediaDir, fileName), bytes);
}

export function listProfileMediaFiles(profileId: string) {
  const mediaDir = profileMediaDir(profileId);
  if (!fs.existsSync(mediaDir)) return [];
  return fs
    .readdirSync(mediaDir)
    .filter(isSafeMediaFileName)
    .sort((a, b) => a.localeCompare(b));
}

export function readProfileMediaFile(profileId: string, fileName: string) {
  return fs.readFileSync(mediaPath(profileId, fileName));
}

export function assertContentUsesMediaRefs(
  type: FlashcardType,
  content: FlashcardContent,
) {
  for (const markdownField of markdownFieldsFor(type, content)) {
    assertMarkdownImageRefs(markdownField);
  }

  if (type === "image_occlusion") {
    const imageOcclusionContent = content as ImageOcclusionContent;
    assertMediaRef(imageOcclusionContent.baseImage, "Image occlusion base image");
  }
}

export function rewriteMarkdownMediaForExport(markdown: string) {
  return markdown.replace(
    new RegExp(
      `${MEDIA_REF_PREFIX}([a-f0-9]{64}\\.(?:png|jpg|gif|webp|svg|bmp|avif))`,
      "g",
    ),
    "../../media/$1",
  );
}

export function canonicalizeLegacyMediaInContent(
  profileId: string,
  type: FlashcardType,
  content: FlashcardContent,
) {
  let changed = false;
  const replaceDataImages = (text: string) =>
    text.replace(DATA_IMAGE_RE, (_dataUrl, rawSubtype: string, base64: string) => {
      changed = true;
      const bytes = Buffer.from(base64, "base64");
      const storedMedia = storeFlashcardMedia({
        profileId,
        bytes,
        mime: `image/${rawSubtype.toLowerCase()}`,
      });
      return storedMedia.ref;
    });

  switch (type) {
    case "basic":
    case "basic_reversed": {
      const basicContent = content as { front: string; back: string };
      return {
        changed,
        content: {
          ...basicContent,
          front: replaceDataImages(basicContent.front),
          back: replaceDataImages(basicContent.back),
        },
      };
    }
    case "cloze": {
      const clozeContent = content as { text: string };
      return {
        changed,
        content: {
          ...clozeContent,
          text: replaceDataImages(clozeContent.text),
        },
      };
    }
    case "type_answer": {
      const typeAnswerContent = content as {
        prompt: string;
        answer: string;
        acceptedAnswers: string[];
      };
      return {
        changed,
        content: {
          ...typeAnswerContent,
          prompt: replaceDataImages(typeAnswerContent.prompt),
        },
      };
    }
    case "image_occlusion": {
      const imageOcclusionContent = content as ImageOcclusionContent;
      const nextContent: ImageOcclusionContent = {
        ...imageOcclusionContent,
        baseImage: replaceDataImages(imageOcclusionContent.baseImage),
        header: imageOcclusionContent.header
          ? replaceDataImages(imageOcclusionContent.header)
          : imageOcclusionContent.header,
        extra: imageOcclusionContent.extra
          ? replaceDataImages(imageOcclusionContent.extra)
          : imageOcclusionContent.extra,
      };
      return { changed, content: nextContent };
    }
  }
}

export function canonicalizeLegacyMediaForWrite(
  profileId: string,
  type: FlashcardType,
  content: FlashcardContent,
) {
  const result = canonicalizeLegacyMediaInContent(profileId, type, content);
  return result.content;
}

export async function upgradeLegacyFlashcardMedia(ctx: ServiceContext) {
  const flashcards = ctx.db.select().from(schema.flashcards).all();
  const mediaUpdates: { flashcard: Flashcard; content: FlashcardContent }[] = [];

  for (const flashcard of flashcards) {
    const parsed = parseStoredContent(flashcard.type, flashcard.content);
    const { content, changed } = canonicalizeLegacyMediaInContent(
      ctx.profileId,
      parsed.type,
      parsed.content,
    );
    if (changed) mediaUpdates.push({ flashcard, content });
  }

  if (mediaUpdates.length === 0) return;

  ctx.db.transaction((tx) => {
    for (const mediaUpdate of mediaUpdates) {
      tx.update(schema.flashcards)
        .set({
          content: serializeContent(mediaUpdate.content),
          updatedAt: mediaUpdate.flashcard.updatedAt,
        })
        .where(eq(schema.flashcards.id, mediaUpdate.flashcard.id))
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

function detectImageKind(bytes: Uint8Array, fileName?: string, mime?: string) {
  const sniffedKind = sniffImageKind(bytes);
  if (sniffedKind) return sniffedKind;

  const extensionFromMime = mime ? EXT_BY_MIME[mime.toLowerCase()] : undefined;
  if (extensionFromMime) {
    return { ext: extensionFromMime, mime: MIME_BY_EXT[extensionFromMime] };
  }

  const extensionFromName = extensionFromFileName(fileName);
  if (extensionFromName) {
    return { ext: extensionFromName, mime: MIME_BY_EXT[extensionFromName] };
  }

  throw new Error(
    "Unsupported Flashcard media image type. Use PNG, JPG, GIF, WebP, SVG, BMP, or AVIF.",
  );
}

function sniffImageKind(bytes: Uint8Array) {
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

function extensionFromFileName(fileName?: string) {
  const ext = fileName?.split(".").pop()?.toLowerCase();
  if (!ext) return undefined;
  if (ext === "jpeg") return "jpg";
  return (Object.keys(MIME_BY_EXT) as ImageKind["ext"][]).find((e) => e === ext);
}

function markdownFieldsFor(type: FlashcardType, content: FlashcardContent) {
  switch (type) {
    case "basic":
    case "basic_reversed": {
      const basicContent = content as { front: string; back: string };
      return [basicContent.front, basicContent.back];
    }
    case "cloze":
      return [(content as { text: string }).text];
    case "type_answer":
      return [(content as { prompt: string }).prompt];
    case "image_occlusion": {
      const imageOcclusionContent = content as ImageOcclusionContent;
      return [imageOcclusionContent.header, imageOcclusionContent.extra].filter(
        (value): value is string => Boolean(value),
      );
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
