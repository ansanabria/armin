const MEDIA_REF_RE =
  /armin-media:[a-f0-9]{64}\.(?:png|jpg|gif|webp|svg|bmp|avif)/g;

const MEDIA_URL_RE =
  /armin-media:\/\/[^)\s"']+\/[a-f0-9]{64}\.(?:png|jpg|gif|webp|svg|bmp|avif)/g;

export function mediaDisplayUrl(ref: string): string {
  return window.armin?.media?.url(ref) ?? ref;
}

export function mediaRefFromDisplayUrl(url: string): string | null {
  return window.armin?.media?.refFromUrl(url) ?? null;
}

export function resolveMediaRefsInMarkdown(markdown: string): string {
  return markdown.replace(MEDIA_REF_RE, (ref) => mediaDisplayUrl(ref));
}

export function persistMediaRefsInMarkdown(markdown: string): string {
  return markdown.replace(
    MEDIA_URL_RE,
    (url) => mediaRefFromDisplayUrl(url) ?? url,
  );
}
