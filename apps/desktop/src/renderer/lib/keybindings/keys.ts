/**
 * Canonical key model for the keybinding system.
 *
 * A {@link Binding} is the serialized form a Command is bound to. It is a
 * sequence of one or more **chord steps** separated by spaces ("g d"), where
 * each step is a single key combo ("Mod+k", "Space", "1", "ArrowLeft").
 *
 * Steps store a platform-neutral `Mod` token meaning ⌘ on macOS and Ctrl
 * elsewhere, so a single default keymap works cross-platform. Matching against a
 * real `KeyboardEvent` and human-facing rendering both go through here so the
 * rest of the app never parses `event.key` by hand.
 */

const isMac =
  typeof navigator !== "undefined" &&
  navigator.platform.toLowerCase().includes("mac");

/** Named keys we keep verbatim (a `Shift` modifier is meaningful on these). */
const NAMED_KEYS = new Set([
  "Space",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Enter",
  "Escape",
  "Tab",
  "Backspace",
  "Delete",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

export type ChordStep = {
  mod: boolean;
  alt: boolean;
  shift: boolean;
  /** Canonical base key: "Space", "ArrowLeft", a lowercase letter, a digit, or a literal character like "?". */
  key: string;
};

/** True when a step carries a "real" modifier (Mod/Alt) — used by the typing-suppression rule. */
export function stepHasStrongModifier(step: ChordStep): boolean {
  return step.mod || step.alt;
}

function normalizeKey(raw: string): string | null {
  if (raw === " ") return "Space";
  if (NAMED_KEYS.has(raw)) return raw;
  // A bare modifier press has no base key of its own.
  if (["Control", "Meta", "Shift", "Alt", "AltGraph", "Dead"].includes(raw)) {
    return null;
  }
  if (raw.length === 1) {
    // Letters canonicalize to lowercase; digits and symbols stay as their
    // (already shift-resolved) character, so "?" is just "?".
    return /[a-z]/i.test(raw) ? raw.toLowerCase() : raw;
  }
  return raw;
}

/** Build a canonical step from a real keyboard event, or null if it's only a modifier press. */
export function stepFromEvent(event: KeyboardEvent): ChordStep | null {
  const key = normalizeKey(event.key);
  if (key === null) return null;
  // Shift is only treated as a modifier on letters and named keys; for symbols
  // and digits it has already been folded into `event.key` (Shift+/ -> "?").
  const shiftIsModifier = /^[a-z]$/.test(key) || NAMED_KEYS.has(key);
  return {
    mod: isMac ? event.metaKey : event.ctrlKey,
    alt: event.altKey,
    shift: shiftIsModifier && event.shiftKey,
    key,
  };
}

export function serializeStep(step: ChordStep): string {
  const parts: string[] = [];
  if (step.mod) parts.push("Mod");
  if (step.alt) parts.push("Alt");
  if (step.shift) parts.push("Shift");
  parts.push(step.key);
  return parts.join("+");
}

export function parseStep(token: string): ChordStep {
  const parts = token.split("+");
  const key = parts.pop() ?? "";
  return {
    mod: parts.includes("Mod"),
    alt: parts.includes("Alt"),
    shift: parts.includes("Shift"),
    key,
  };
}

/** A binding is one or more steps, space-separated: "Mod+k", "g d", "Space". */
export function parseBinding(binding: string): ChordStep[] {
  return binding
    .split(" ")
    .map((t) => t.trim())
    .filter(Boolean)
    .map(parseStep);
}

export function stepsEqual(a: ChordStep, b: ChordStep): boolean {
  return a.mod === b.mod && a.alt === b.alt && a.shift === b.shift && a.key === b.key;
}

export function serializeSteps(steps: ChordStep[]): string {
  return steps.map(serializeStep).join(" ");
}

/** True when `prefix` is a (non-strict) leading subsequence of `steps`. */
export function isStepsPrefix(prefix: ChordStep[], steps: ChordStep[]): boolean {
  if (prefix.length > steps.length) return false;
  return prefix.every((step, i) => stepsEqual(step, steps[i]));
}

const MOD_LABEL = isMac ? "⌘" : "Ctrl";
const KEY_LABELS: Record<string, string> = {
  Space: "Space",
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  Enter: "↵",
  Escape: "Esc",
};

function renderKeyLabel(key: string): string {
  if (KEY_LABELS[key]) return KEY_LABELS[key];
  return key.length === 1 ? key.toUpperCase() : key;
}

/** Human-facing tokens for a step, e.g. ["⌘", "K"] or ["G"]. One token per <Kbd>. */
export function stepLabels(step: ChordStep): string[] {
  const tokens: string[] = [];
  if (step.mod) tokens.push(MOD_LABEL);
  if (step.alt) tokens.push(isMac ? "⌥" : "Alt");
  if (step.shift) tokens.push(isMac ? "⇧" : "Shift");
  tokens.push(renderKeyLabel(step.key));
  return tokens;
}

/** Flat display string for a whole binding, e.g. "G then D" or "⌘ K". */
export function formatBinding(binding: string): string {
  const steps = parseBinding(binding);
  if (steps.length === 0) return "—";
  const rendered = steps.map((s) => stepLabels(s).join(isMac ? "" : "+"));
  return rendered.join(" then ");
}
