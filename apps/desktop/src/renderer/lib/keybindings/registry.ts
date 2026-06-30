/**
 * The Command registry: the single source of truth for every app-level
 * keyboard action and its factory-default binding.
 *
 * The registry covers ONLY app-level actions (navigation, review, cram, and
 * opening the palette/cheatsheet). Widget and OS conventions — dialog Escape,
 * the Tab focus-trap, form submit, tag entry, editor formatting — are NOT
 * Commands; they stay as their existing intrinsic handlers. See
 * docs/adr/0018-keybindings-central-dispatcher-and-command-registry.md.
 */

import {
  isStepsPrefix,
  parseBinding,
  serializeSteps,
  type ChordStep,
} from "./keys";

/** Logical scope a Command lives in. Route scopes are active only on their screen. */
export type CommandScope = "global" | "review" | "cram";

export type CommandId = string;

export type CommandDef = {
  id: CommandId;
  scope: CommandScope;
  /** Cheatsheet/palette section header. */
  group: string;
  /** Human label shown in the palette, cheatsheet, and settings. */
  label: string;
  /** Canonical factory binding ("g d", "Mod+k", "Space"); "" means unbound by default. */
  defaultBinding: string;
  /** Fire even when focus is in an editable target (bare keys are otherwise suppressed). */
  allowInInput?: boolean;
  /** Hidden from the command palette (still rebindable + shown in the cheatsheet). */
  hiddenInPalette?: boolean;
};

/**
 * Factory defaults. Order here drives cheatsheet/palette ordering within a group.
 * `nav.*` chords share the `g` prefix; the dispatcher waits for the second key.
 */
export const COMMANDS: readonly CommandDef[] = [
  // Navigation
  { id: "nav.decks", scope: "global", group: "Navigation", label: "Go to Decks", defaultBinding: "g d" },
  { id: "nav.browse", scope: "global", group: "Navigation", label: "Go to Browse", defaultBinding: "g b" },
  { id: "nav.cram", scope: "global", group: "Navigation", label: "Go to Cram", defaultBinding: "g c" },
  { id: "nav.review", scope: "global", group: "Navigation", label: "Go to Review", defaultBinding: "g r" },
  { id: "nav.settings", scope: "global", group: "Navigation", label: "Go to Settings", defaultBinding: "g s" },

  // General
  { id: "palette.open", scope: "global", group: "General", label: "Open command palette", defaultBinding: "Mod+k" },
  { id: "cheatsheet.open", scope: "global", group: "General", label: "Show keyboard shortcuts", defaultBinding: "?" },

  // Review session
  { id: "review.flip", scope: "review", group: "Review", label: "Show answer", defaultBinding: "Space" },
  { id: "review.rate.again", scope: "review", group: "Review", label: "Rate Again", defaultBinding: "1" },
  { id: "review.rate.hard", scope: "review", group: "Review", label: "Rate Hard", defaultBinding: "2" },
  { id: "review.rate.good", scope: "review", group: "Review", label: "Rate Good", defaultBinding: "3" },
  { id: "review.rate.easy", scope: "review", group: "Review", label: "Rate Easy", defaultBinding: "4" },
  { id: "review.prev", scope: "review", group: "Review", label: "Previous card", defaultBinding: "ArrowLeft" },
  { id: "review.next", scope: "review", group: "Review", label: "Next card", defaultBinding: "ArrowRight" },

  // Cram session
  { id: "cram.flip", scope: "cram", group: "Cram", label: "Show answer", defaultBinding: "Space" },
  { id: "cram.miss", scope: "cram", group: "Cram", label: "Mark incorrect", defaultBinding: "1" },
  { id: "cram.got", scope: "cram", group: "Cram", label: "Mark correct", defaultBinding: "2" },
] as const;

export const COMMAND_BY_ID: ReadonlyMap<CommandId, CommandDef> = new Map(
  COMMANDS.map((c) => [c.id, c]),
);

/** A Keymap maps every known Command id to its current binding string. */
export type Keymap = Record<CommandId, string>;

/** Per-profile overrides: only the Commands the user changed. */
export type KeybindingOverrides = Record<CommandId, string>;

export function factoryKeymap(): Keymap {
  const map: Keymap = {};
  for (const c of COMMANDS) map[c.id] = c.defaultBinding;
  return map;
}

/** Effective keymap = factory ◁ profile override diff. Unknown override ids are ignored. */
export function resolveKeymap(overrides: KeybindingOverrides | null | undefined): Keymap {
  const map = factoryKeymap();
  if (overrides) {
    for (const [id, binding] of Object.entries(overrides)) {
      if (COMMAND_BY_ID.has(id)) map[id] = binding;
    }
  }
  return map;
}

/** Keep only the overrides that actually differ from the factory default. */
export function diffFromFactory(keymap: Keymap): KeybindingOverrides {
  const diff: KeybindingOverrides = {};
  for (const c of COMMANDS) {
    const current = keymap[c.id] ?? c.defaultBinding;
    if (current !== c.defaultBinding) diff[c.id] = current;
  }
  return diff;
}

export type Conflict =
  | { kind: "duplicate"; commandId: CommandId }
  | { kind: "prefix"; commandId: CommandId }
  | { kind: "reserved" };

/**
 * Two scopes are co-active when they can be active at the same time, so a
 * binding collision between them is observable. `global` is always active
 * beneath every screen, so it's co-active with everything; the route scopes
 * (`review`, `cram`) are mutually exclusive, so reusing a binding across them is
 * harmless (only one is ever active).
 */
function scopesCoActive(a: CommandScope, b: CommandScope): boolean {
  return a === b || a === "global" || b === "global";
}

/**
 * Validate assigning `binding` to `target` against `keymap`. A conflict exists
 * between co-active scopes (see {@link scopesCoActive}) — the same scope, or
 * either scope being the always-active `global`:
 * - duplicate: a co-active Command already uses this exact binding
 * - prefix: this binding is a prefix of, or has as a prefix, a co-active
 *   binding. Because the dispatcher waits (`pending`) whenever a longer chord is
 *   still reachable, a bare key that prefixes an active chord — e.g. `g` while
 *   `g d` exists in `global` — would never fire, so it must be rejected.
 * Reserved keys (bare Escape/Tab/Enter, owned by intrinsic handlers) are blocked.
 */
export function findConflict(
  keymap: Keymap,
  target: CommandDef,
  binding: string,
): Conflict | null {
  const steps = parseBinding(binding);
  if (steps.length === 0) return null;
  if (isReserved(steps)) return { kind: "reserved" };

  for (const other of COMMANDS) {
    if (other.id === target.id) continue;
    if (!scopesCoActive(other.scope, target.scope)) continue;
    const otherBinding = keymap[other.id];
    if (!otherBinding) continue;
    const otherSteps = parseBinding(otherBinding);
    if (otherSteps.length === 0) continue;
    if (serializeSteps(otherSteps) === serializeSteps(steps)) {
      return { kind: "duplicate", commandId: other.id };
    }
    if (isStepsPrefix(steps, otherSteps) || isStepsPrefix(otherSteps, steps)) {
      return { kind: "prefix", commandId: other.id };
    }
  }
  return null;
}

/**
 * Reuse of the same binding across scopes that are NOT co-active (e.g. `review`
 * and `cram`) — allowed, but surfaced as info. Co-active reuse is a hard
 * conflict instead (see {@link findConflict}).
 */
export function findSharedBindingCommands(
  keymap: Keymap,
  target: CommandDef,
  binding: string,
): CommandDef[] {
  const wanted = serializeSteps(parseBinding(binding));
  if (!wanted) return [];
  return COMMANDS.filter(
    (c) =>
      c.id !== target.id &&
      !scopesCoActive(c.scope, target.scope) &&
      serializeSteps(parseBinding(keymap[c.id] ?? "")) === wanted,
  );
}

const RESERVED_BARE = new Set(["Escape", "Tab", "Enter"]);

function isReserved(steps: ChordStep[]): boolean {
  return steps.some(
    (s) => !s.mod && !s.alt && RESERVED_BARE.has(s.key),
  );
}
