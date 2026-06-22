/**
 * Deterministic per-deck color for the global graph's deck lens.
 *
 * Decks have no stored color, so we derive a stable one from the deck id. The
 * palette is the Flexoki 400-level accent ramp (reads on both warm paper and the
 * dark theme). Cyan is deliberately excluded — it is the brand accent used for
 * the selection/neighbor highlight, so keeping it out of deck colors stops decks
 * from fighting that emphasis state. Color is decorative only; nodes always carry
 * the deck name as text, which is the color-blind-safe cue.
 */
const DECK_PALETTE = [
  "var(--flexoki-blue-400)",
  "var(--flexoki-purple-400)",
  "var(--flexoki-magenta-400)",
  "var(--flexoki-green-400)",
  "var(--flexoki-orange-400)",
  "var(--flexoki-yellow-400)",
  "var(--flexoki-red-400)",
] as const;

/** Stable string hash (djb2) so a deck keeps its color across sessions. */
function hash(value: string): number {
  let h = 5381;
  for (let i = 0; i < value.length; i++) {
    h = (h * 33) ^ value.charCodeAt(i);
  }
  return h >>> 0;
}

export function deckColor(deckId: string): string {
  return DECK_PALETTE[hash(deckId) % DECK_PALETTE.length];
}
