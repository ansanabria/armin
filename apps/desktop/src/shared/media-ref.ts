export const MEDIA_PROTOCOL = "armin-media";
export const MEDIA_REF_PREFIX = `${MEDIA_PROTOCOL}:`;

const MEDIA_EXT_PATTERN = "png|jpg|gif|webp|svg|bmp|avif";
const MEDIA_FILE_PATTERN = `[a-f0-9]{64}\\.(?:${MEDIA_EXT_PATTERN})`;
const MEDIA_FILE_RE = new RegExp(`^${MEDIA_FILE_PATTERN}$`);
const MEDIA_REF_RE = new RegExp(`^${MEDIA_REF_PREFIX}${MEDIA_FILE_PATTERN}$`);
const MEDIA_REF_GLOBAL_RE = new RegExp(
  `${MEDIA_REF_PREFIX}${MEDIA_FILE_PATTERN}`,
  "g",
);
const MEDIA_URL_GLOBAL_RE = new RegExp(
  `${MEDIA_PROTOCOL}://[^)\\s"']+/${MEDIA_FILE_PATTERN}`,
  "g",
);

export function isSafeMediaFileName(fileName: string): boolean {
  return MEDIA_FILE_RE.test(fileName);
}

export function parseMediaRef(ref: string): string | null {
  if (!MEDIA_REF_RE.test(ref)) return null;
  return ref.slice(MEDIA_REF_PREFIX.length);
}

export function isMediaRef(value: string): boolean {
  return parseMediaRef(value) !== null;
}

export function mediaFileNameFromRef(ref: string): string {
  const fileName = parseMediaRef(ref);
  if (!fileName) {
    throw new Error("Invalid Flashcard media reference.");
  }
  return fileName;
}

export function mediaRefFromFileName(fileName: string): string {
  if (!isSafeMediaFileName(fileName)) {
    throw new Error("Invalid Flashcard media filename.");
  }
  return `${MEDIA_REF_PREFIX}${fileName}`;
}

export function mediaUrlForProfile(profileId: string, fileName: string): string {
  if (!isSafeMediaFileName(fileName)) return fileName;
  return `${MEDIA_PROTOCOL}://${encodeURIComponent(profileId)}/${fileName}`;
}

export function mediaUrlForProfileRef(profileId: string | null, ref: string) {
  const fileName = parseMediaRef(ref);
  if (!profileId || !fileName) return ref;
  return mediaUrlForProfile(profileId, fileName);
}

export function mediaRefFromProfileUrl(
  profileId: string | null,
  url: string,
): string | null {
  if (!profileId) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== `${MEDIA_PROTOCOL}:`) return null;
    if (decodeURIComponent(parsed.hostname) !== profileId) return null;
    const fileName = parsed.pathname.replace(/^\//, "");
    if (!isSafeMediaFileName(fileName)) return null;
    return mediaRefFromFileName(fileName);
  } catch {
    return null;
  }
}

export function replaceMediaRefs(
  value: string,
  replacer: (ref: string, fileName: string) => string,
): string {
  return value.replace(MEDIA_REF_GLOBAL_RE, (ref) =>
    replacer(ref, mediaFileNameFromRef(ref)),
  );
}

export function replaceMediaUrls(
  value: string,
  replacer: (url: string) => string,
): string {
  return value.replace(MEDIA_URL_GLOBAL_RE, replacer);
}
