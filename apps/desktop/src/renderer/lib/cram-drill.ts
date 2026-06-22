/**
 * Pure state machine for an ephemeral cram drill. It owns no React state and
 * never touches persistence — the component holds a {@link DrillState} and asks
 * this module how it evolves. Two modes:
 *
 * - `free`: every unit is available immediately; order is up to the caller.
 * - `graph`: a flashcard's units become available only once all of its in-scope
 *   prerequisite flashcards are cleared (every unit they generate answered
 *   correctly). Clearing a flashcard unlocks its dependents mid-session.
 *
 * In both modes a missed unit re-queues to the back until it is finally cleared.
 */
export type DrillUnit = { id: string; flashcardId: string };
export type DrillGroup = { flashcardId: string; reviewUnitIds: string[] };
export type DrillEdge = { prereqId: string; dependentId: string };
export type DrillMode = "free" | "graph";

/** Names used by the cram UI; aliases of the drill primitives. */
export type CramMode = DrillMode;
export type CramFlashcardGroup = DrillGroup;

export type DrillIndex = {
  units: DrillUnit[];
  mode: DrillMode;
  unitsByFlashcard: Map<string, string[]>;
  prereqsByDependent: Map<string, string[]>;
};

export type DrillState = {
  cleared: Set<string>;
  queue: string[];
};

export function buildDrillIndex(
  units: DrillUnit[],
  groups: DrillGroup[],
  edges: DrillEdge[],
  mode: DrillMode,
): DrillIndex {
  const unitsByFlashcard = new Map(
    groups.map((group) => [group.flashcardId, group.reviewUnitIds]),
  );
  const prereqsByDependent = new Map<string, string[]>();
  for (const edge of edges) {
    const list = prereqsByDependent.get(edge.dependentId) ?? [];
    list.push(edge.prereqId);
    prereqsByDependent.set(edge.dependentId, list);
  }
  return { units, mode, unitsByFlashcard, prereqsByDependent };
}

export function flashcardCleared(
  index: DrillIndex,
  flashcardId: string,
  cleared: Set<string>,
): boolean {
  return (index.unitsByFlashcard.get(flashcardId) ?? []).every((id) =>
    cleared.has(id),
  );
}

export function isUnlocked(
  index: DrillIndex,
  flashcardId: string,
  cleared: Set<string>,
): boolean {
  if (index.mode === "free") return true;
  return (index.prereqsByDependent.get(flashcardId) ?? []).every((prereqId) =>
    flashcardCleared(index, prereqId, cleared),
  );
}

/** Uncleared units whose flashcard is currently unlocked, in their input order. */
export function activeUnitIds(
  index: DrillIndex,
  cleared: Set<string>,
): string[] {
  return index.units
    .filter(
      (unit) =>
        !cleared.has(unit.id) && isUnlocked(index, unit.flashcardId, cleared),
    )
    .map((unit) => unit.id);
}

/**
 * Apply a verdict to the unit at the head of the queue. Correct → mark cleared
 * and append any units newly unlocked by that clear. Incorrect → rotate the
 * unit to the back so it returns later.
 */
export function answerHead(
  index: DrillIndex,
  state: DrillState,
  correct: boolean,
): DrillState {
  const head = state.queue[0];
  if (!head) return state;

  if (!correct) {
    const queue =
      state.queue.length > 1
        ? [...state.queue.slice(1), head]
        : [...state.queue];
    return { cleared: state.cleared, queue };
  }

  const cleared = new Set(state.cleared);
  cleared.add(head);
  const queue = state.queue.filter((id) => id !== head);
  for (const id of activeUnitIds(index, cleared)) {
    if (!queue.includes(id)) queue.push(id);
  }
  return { cleared, queue };
}

export function isDrillDone(index: DrillIndex, state: DrillState): boolean {
  return index.units.length > 0 && state.queue.length === 0;
}
