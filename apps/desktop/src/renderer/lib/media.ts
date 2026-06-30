import { replaceMediaRefs, replaceMediaUrls } from "../../shared/media-ref";

export function mediaDisplayUrl(ref: string): string {
  return window.armin?.media?.url(ref) ?? ref;
}

export function mediaRefFromDisplayUrl(url: string): string | null {
  return window.armin?.media?.refFromUrl(url) ?? null;
}

export function resolveMediaRefsInMarkdown(markdown: string): string {
  return replaceMediaRefsInMarkdown(markdown);
}

export function persistMediaRefsInMarkdown(markdown: string): string {
  return replaceMediaUrls(markdown, (url) => mediaRefFromDisplayUrl(url) ?? url);
}

function replaceMediaRefsInMarkdown(markdown: string): string {
  return replaceMediaRefs(markdown, (ref) => mediaDisplayUrl(ref));
}
