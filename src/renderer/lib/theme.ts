export type ThemePreference = "flexoki-light" | "flexoki-dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "armin-theme-preference";

export const THEME_OPTIONS: {
  value: ThemePreference;
  label: string;
}[] = [
  { value: "flexoki-light", label: "Flexoki light" },
  { value: "flexoki-dark", label: "Flexoki dark" },
  { value: "system", label: "System" },
];

/** Shorter labels for the title bar context menu. */
export const TITLEBAR_THEME_OPTIONS: {
  value: ThemePreference;
  label: string;
}[] = [
  { value: "system", label: "System" },
  { value: "flexoki-light", label: "Light" },
  { value: "flexoki-dark", label: "Dark" },
];

export function getSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === "flexoki-light") return "light";
  if (preference === "flexoki-dark") return "dark";
  return getSystemTheme();
}

export function normalizeThemePreference(value: string | null): ThemePreference {
  if (
    value === "flexoki-light" ||
    value === "flexoki-dark" ||
    value === "system"
  ) {
    return value;
  }
  if (value === "light") return "flexoki-light";
  return "system";
}

export function readStoredThemePreference(): ThemePreference {
  try {
    return normalizeThemePreference(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

export function storeThemePreference(preference: ThemePreference) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    /* ignore quota / privacy mode */
  }
}

export function applyResolvedTheme(resolved: ResolvedTheme) {
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
}

export function applyThemePreference(preference: ThemePreference) {
  applyResolvedTheme(resolveTheme(preference));
}
