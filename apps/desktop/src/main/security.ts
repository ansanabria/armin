import { app, session } from "electron";

// Production renderers load bundled, static assets over file://, so they can run
// under a tight policy: only same-origin scripts, inline styles (Tailwind/React
// inject style attributes), and data: images (base images and occlusion cards are
// stored as data URLs). No 'unsafe-eval', no remote origins.
const PROD_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-src 'none'",
  "form-action 'none'",
].join("; ");

// In dev the renderer is served by Vite over http://localhost. Native ES modules
// don't need eval, but @vitejs/plugin-react injects an inline Fast Refresh
// preamble (hence 'unsafe-inline' for scripts) and HMR needs a websocket back to
// the dev server. We deliberately omit 'unsafe-eval' so Electron's insecure-CSP
// warning stays silent and any accidental eval usage gets caught.
const DEV_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' ws: wss:",
  "object-src 'none'",
  "base-uri 'self'",
].join("; ");

/**
 * Set a Content-Security-Policy on every renderer response. Without this the
 * renderer ships with no CSP, which Electron flags as insecure and which leaves
 * the packaged app unprotected against injected content.
 */
export function applyContentSecurityPolicy() {
  const policy = app.isPackaged ? PROD_CSP : DEV_CSP;

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders };
    // Drop any upstream CSP (case-insensitive) so ours is authoritative.
    for (const key of Object.keys(responseHeaders)) {
      if (key.toLowerCase() === "content-security-policy") {
        delete responseHeaders[key];
      }
    }
    responseHeaders["Content-Security-Policy"] = [policy];
    callback({ responseHeaders });
  });
}
