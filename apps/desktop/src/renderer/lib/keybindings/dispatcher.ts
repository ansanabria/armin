/**
 * Pure dispatch resolution: given the current chord buffer and the set of
 * currently-fireable Commands, decide whether a Command fires, whether we are
 * mid-chord (a longer binding is still reachable), or nothing matches.
 *
 * Runtime concerns — the scope stack, modal isolation, typing suppression, the
 * chord timeout, and `preventDefault` — live in the provider. This stays a pure
 * function so the precedence and chord rules are unit-testable.
 */

import {
  isStepsPrefix,
  parseBinding,
  stepsEqual,
  type ChordStep,
} from "./keys";
import type { CommandId } from "./registry";

/** A Command eligible to fire right now (scope active, handler present, not modal-isolated). */
export type FireableCommand = {
  commandId: CommandId;
  /** Position in the scope stack; deeper (more recently pushed) wins ties. */
  depth: number;
  /** Effective binding string for this Command. */
  binding: string;
};

export type Resolution =
  | { type: "fire"; commandId: CommandId }
  | { type: "pending" }
  | { type: "none" };

function bindingSteps(c: FireableCommand): ChordStep[] {
  return parseBinding(c.binding);
}

function exactlyMatches(buffer: ChordStep[], steps: ChordStep[]): boolean {
  return (
    steps.length === buffer.length &&
    steps.every((s, i) => stepsEqual(s, buffer[i]))
  );
}

/**
 * Resolve the buffer against the fireable set.
 * - If any fireable binding strictly extends the buffer → `pending` (await the
 *   next key or the timeout). This is how chords like "g d" wait after "g".
 * - Else if any fireable binding exactly equals the buffer → `fire` the deepest.
 * - Else → `none`.
 */
export function resolve(
  buffer: ChordStep[],
  fireable: FireableCommand[],
): Resolution {
  if (buffer.length === 0) return { type: "none" };

  let pending = false;
  let best: FireableCommand | null = null;

  for (const c of fireable) {
    const steps = bindingSteps(c);
    if (steps.length === 0) continue;
    if (steps.length > buffer.length && isStepsPrefix(buffer, steps)) {
      pending = true;
      continue;
    }
    if (exactlyMatches(buffer, steps)) {
      if (!best || c.depth > best.depth) best = c;
    }
  }

  if (pending) return { type: "pending" };
  if (best) return { type: "fire", commandId: best.commandId };
  return { type: "none" };
}
