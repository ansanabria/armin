// Resolve and apply the saved theme before first paint to avoid a flash.
// Kept as an external classic script (not inline) so the renderer can run under
// a strict `script-src 'self'` Content-Security-Policy. See src/main/security.ts.
(function () {
  try {
    var key = "armin-theme-preference";
    var pref = localStorage.getItem(key);
    if (pref === "light") pref = "flexoki-light";
    var resolved =
      pref === "flexoki-dark"
        ? "dark"
        : pref === "flexoki-light"
          ? "light"
          : window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light";
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
  } catch (e) {
    document.documentElement.dataset.theme = "light";
    document.documentElement.style.colorScheme = "light";
  }
})();
