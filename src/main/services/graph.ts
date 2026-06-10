import { and, eq, inArray, notInArray } from "drizzle-orm";
import { schema } from "../db";
import { noteDisplay, parseStoredContent, type CardType } from "./card-types";
import type { ServiceContext } from "./context";
import {
  isPendingSchedule,
  isPrereqSecured,
  newCardFields,
  pendingCardFields,
} from "./scheduler";
import { getSettings } from "./settings";

const { cards, notePrereqs, notes } = schema;

export async function getPrereqIds(
  ctx: ServiceContext,
  noteId: string,
): Promise<string[]> {
  const rows = await ctx.db
    .select({ id: notePrereqs.prereqId })
    .from(notePrereqs)
    .where(eq(notePrereqs.dependentId, noteId))
    .all();
  return rows.map((r) => r.id);
}

export async function getDependentIds(
  ctx: ServiceContext,
  noteId: string,
): Promise<string[]> {
  const rows = await ctx.db
    .select({ id: notePrereqs.dependentId })
    .from(notePrereqs)
    .where(eq(notePrereqs.prereqId, noteId))
    .all();
  return rows.map((r) => r.id);
}

async function getPrereqStabilityFloor(ctx: ServiceContext): Promise<number> {
  return (await getSettings(ctx)).prereqStabilityFloor;
}

/**
 * A note is "secured" only when every review item it generated is secured in
 * FSRS (Review state with stability at or above the user floor).
 */
async function getNotesSecured(
  ctx: ServiceContext,
  noteIds: string[],
): Promise<Map<string, boolean>> {
  const uniqueIds = [...new Set(noteIds)];
  const secured = new Map(uniqueIds.map((id) => [id, false]));
  if (uniqueIds.length === 0) return secured;

  const floor = await getPrereqStabilityFloor(ctx);
  const rows = await ctx.db
    .select({
      noteId: cards.noteId,
      state: cards.state,
      stability: cards.stability,
    })
    .from(cards)
    .where(inArray(cards.noteId, uniqueIds))
    .all();

  const byNote = new Map<string, { state: number; stability: number }[]>();
  for (const row of rows) {
    const list = byNote.get(row.noteId) ?? [];
    list.push(row);
    byNote.set(row.noteId, list);
  }

  for (const id of uniqueIds) {
    const cardRows = byNote.get(id) ?? [];
    secured.set(
      id,
      cardRows.length > 0 &&
        cardRows.every((row) => isPrereqSecured(row, floor)),
    );
  }

  return secured;
}

/** A note is unlocked when none of its prerequisite notes are still locked. */
export async function isUnlocked(
  ctx: ServiceContext,
  noteId: string,
): Promise<boolean> {
  const locked = await getLockedByNoteIds(ctx, [noteId]);
  return !(locked.get(noteId) ?? false);
}

/** Batch locked lookup from the denormalized notes.locked column. */
export async function getLockedByNoteIds(
  ctx: ServiceContext,
  noteIds: string[],
): Promise<Map<string, boolean>> {
  const uniqueIds = [...new Set(noteIds)];
  const locked = new Map(uniqueIds.map((id) => [id, false]));
  if (uniqueIds.length === 0) return locked;

  const rows = await ctx.db
    .select({ id: notes.id, locked: notes.locked })
    .from(notes)
    .where(inArray(notes.id, uniqueIds))
    .all();

  for (const row of rows) {
    locked.set(row.id, row.locked);
  }

  return locked;
}

/** Recompute lock state from the prerequisite graph + prereq securedness. */
async function computeLockedByNoteIds(
  ctx: ServiceContext,
  noteIds: string[],
): Promise<Map<string, boolean>> {
  const uniqueIds = [...new Set(noteIds)];
  const locked = new Map(uniqueIds.map((id) => [id, false]));
  if (uniqueIds.length === 0) return locked;

  const edges = await ctx.db
    .select({
      dependentId: notePrereqs.dependentId,
      prereqId: notePrereqs.prereqId,
    })
    .from(notePrereqs)
    .where(inArray(notePrereqs.dependentId, uniqueIds))
    .all();

  if (edges.length === 0) return locked;

  const prereqIds = [...new Set(edges.map((edge) => edge.prereqId))];
  const securedByNote = await getNotesSecured(ctx, prereqIds);

  const prereqsByDependent = new Map<string, string[]>();
  for (const edge of edges) {
    const list = prereqsByDependent.get(edge.dependentId) ?? [];
    list.push(edge.prereqId);
    prereqsByDependent.set(edge.dependentId, list);
  }

  for (const id of uniqueIds) {
    const prereqList = prereqsByDependent.get(id) ?? [];
    if (prereqList.length === 0) continue;
    const unlocked = prereqList.every((prereqId) =>
      securedByNote.get(prereqId),
    );
    locked.set(id, !unlocked);
  }

  return locked;
}

/** Persist note lock state and mirror it onto every generated review item. */
export async function persistLockedForNoteIds(
  ctx: ServiceContext,
  noteIds: string[],
): Promise<void> {
  const uniqueIds = [...new Set(noteIds)];
  if (uniqueIds.length === 0) return;

  const computed = await computeLockedByNoteIds(ctx, uniqueIds);
  const now = new Date();

  await ctx.db.transaction(async (tx) => {
    for (const id of uniqueIds) {
      const locked = computed.get(id) ?? false;
      await tx
        .update(notes)
        .set({ locked, updatedAt: now })
        .where(eq(notes.id, id))
        .run();
      await tx
        .update(cards)
        .set({ locked, updatedAt: now })
        .where(eq(cards.noteId, id))
        .run();
    }
  });
}

async function collectTransitiveDependents(
  ctx: ServiceContext,
  rootId: string,
): Promise<string[]> {
  const seen = new Set<string>();
  const stack = [rootId];

  while (stack.length) {
    const node = stack.pop()!;
    const dependents = await getDependentIds(ctx, node);
    for (const dependentId of dependents) {
      if (seen.has(dependentId)) continue;
      seen.add(dependentId);
      stack.push(dependentId);
    }
  }

  return [...seen];
}

export async function refreshLockedAfterPrereqChange(
  ctx: ServiceContext,
  dependentId: string,
): Promise<void> {
  const affected = await collectTransitiveDependents(ctx, dependentId);
  affected.push(dependentId);
  await persistLockedForNoteIds(ctx, affected);
}

export async function refreshLockedAfterPrereqSecured(
  ctx: ServiceContext,
  prereqId: string,
): Promise<void> {
  const affected = await collectTransitiveDependents(ctx, prereqId);
  if (affected.length === 0) return;
  await persistLockedForNoteIds(ctx, affected);
}

export async function refreshAllLockedStates(
  ctx: ServiceContext,
): Promise<void> {
  const dependents = await ctx.db
    .selectDistinct({ id: notePrereqs.dependentId })
    .from(notePrereqs)
    .all();
  const dependentIds = dependents.map((row) => row.id);

  if (dependentIds.length === 0) {
    await ctx.db.update(notes).set({ locked: false }).run();
    await ctx.db.update(cards).set({ locked: false }).run();
    return;
  }

  await persistLockedForNoteIds(ctx, dependentIds);
  await ctx.db
    .update(notes)
    .set({ locked: false })
    .where(notInArray(notes.id, dependentIds))
    .run();
  await ctx.db
    .update(cards)
    .set({ locked: false })
    .where(notInArray(cards.noteId, dependentIds))
    .run();
}

export async function refreshLockedForDeck(
  ctx: ServiceContext,
  deckId: string,
): Promise<void> {
  const deckNotes = await ctx.db
    .select({ id: notes.id })
    .from(notes)
    .where(eq(notes.deckId, deckId))
    .all();
  const deckNoteIds = deckNotes.map((row) => row.id);
  if (deckNoteIds.length === 0) return;

  const dependents = await ctx.db
    .selectDistinct({ id: notePrereqs.dependentId })
    .from(notePrereqs)
    .where(inArray(notePrereqs.dependentId, deckNoteIds))
    .all();
  const dependentIds = dependents.map((row) => row.id);

  if (dependentIds.length > 0) {
    await persistLockedForNoteIds(ctx, dependentIds);
  }

  const nonDependentIds = deckNoteIds.filter(
    (id) => !dependentIds.includes(id),
  );
  if (nonDependentIds.length === 0) return;

  await ctx.db
    .update(notes)
    .set({ locked: false })
    .where(inArray(notes.id, nonDependentIds))
    .run();
  await ctx.db
    .update(cards)
    .set({ locked: false })
    .where(inArray(cards.noteId, nonDependentIds))
    .run();
}

/** Would adding edge prereq → dependent introduce a cycle? */
async function reaches(
  ctx: ServiceContext,
  from: string,
  target: string,
): Promise<boolean> {
  const seen = new Set<string>();
  const stack = [from];
  while (stack.length) {
    const node = stack.pop()!;
    if (node === target) return true;
    if (seen.has(node)) continue;
    seen.add(node);
    stack.push(...(await getDependentIds(ctx, node)));
  }
  return false;
}

/** Align FSRS scheduling with lock state for a note's never-studied cards. */
export async function syncNoteScheduling(
  ctx: ServiceContext,
  noteId: string,
): Promise<void> {
  const note = await ctx.db
    .select({ locked: notes.locked })
    .from(notes)
    .where(eq(notes.id, noteId))
    .get();
  if (!note) return;

  const unlocked = !note.locked;
  const siblingCards = await ctx.db
    .select()
    .from(cards)
    .where(eq(cards.noteId, noteId))
    .all();
  const now = new Date();

  for (const card of siblingCards) {
    if (card.reps > 0 || card.lastReview != null) continue;
    const pending = isPendingSchedule(card);

    if (!unlocked && !pending) {
      await ctx.db
        .update(cards)
        .set({ ...pendingCardFields(), locked: true, updatedAt: now })
        .where(eq(cards.id, card.id))
        .run();
    } else if (unlocked && pending) {
      await ctx.db
        .update(cards)
        .set({ ...newCardFields(now), locked: false, updatedAt: now })
        .where(eq(cards.id, card.id))
        .run();
    }
  }
}

/** Start FSRS for dependents whose prerequisites just became secured. */
export async function activateUnlockedDependents(
  ctx: ServiceContext,
  noteId: string,
): Promise<void> {
  await refreshLockedAfterPrereqSecured(ctx, noteId);
  const dependentIds = await getDependentIds(ctx, noteId);
  await Promise.all(
    dependentIds.map((dependentId) => syncNoteScheduling(ctx, dependentId)),
  );
}

export async function addPrereq(
  ctx: ServiceContext,
  prereqId: string,
  dependentId: string,
): Promise<void> {
  if (prereqId === dependentId) {
    throw new Error("A card cannot be its own prerequisite.");
  }
  if (await reaches(ctx, dependentId, prereqId)) {
    throw new Error(
      "That edge would create a cycle in the prerequisite graph.",
    );
  }
  const edgeNotes = await ctx.db
    .select({ id: notes.id, deckId: notes.deckId })
    .from(notes)
    .where(inArray(notes.id, [prereqId, dependentId]))
    .all();
  if (edgeNotes.length !== 2) {
    throw new Error("Both cards must exist before connecting prerequisites.");
  }
  const prereq = edgeNotes.find((note) => note.id === prereqId);
  const dependent = edgeNotes.find((note) => note.id === dependentId);
  if (prereq?.deckId !== dependent?.deckId) {
    throw new Error("Prerequisite edges can only connect cards in one deck.");
  }
  await ctx.db
    .insert(notePrereqs)
    .values({ prereqId, dependentId })
    .onConflictDoNothing()
    .run();
  await refreshLockedAfterPrereqChange(ctx, dependentId);
  await syncNoteScheduling(ctx, dependentId);
}

export async function removePrereq(
  ctx: ServiceContext,
  prereqId: string,
  dependentId: string,
): Promise<void> {
  await ctx.db
    .delete(notePrereqs)
    .where(
      and(
        eq(notePrereqs.prereqId, prereqId),
        eq(notePrereqs.dependentId, dependentId),
      ),
    )
    .run();
  await refreshLockedAfterPrereqChange(ctx, dependentId);
  await syncNoteScheduling(ctx, dependentId);
}

export type DeckGraph = {
  nodes: {
    id: string;
    front: string;
    back: string;
    type: CardType;
    state: number;
    locked: boolean;
    x: number | null;
    y: number | null;
  }[];
  edges: { prereqId: string; dependentId: string }[];
};

export async function getDeckGraph(
  ctx: ServiceContext,
  deckId: string,
): Promise<DeckGraph> {
  const db = ctx.db;
  const deckNotes = await db
    .select()
    .from(notes)
    .where(eq(notes.deckId, deckId))
    .all();
  const ids = deckNotes.map((n) => n.id);

  const stateRows = ids.length
    ? await db
        .select({ noteId: cards.noteId, state: cards.state })
        .from(cards)
        .where(inArray(cards.noteId, ids))
        .all()
    : [];
  const minStateByNote = new Map<string, number>();
  for (const row of stateRows) {
    const current = minStateByNote.get(row.noteId);
    if (current === undefined || row.state < current) {
      minStateByNote.set(row.noteId, row.state);
    }
  }

  const edges = ids.length
    ? (
        await db
          .select({
            prereqId: notePrereqs.prereqId,
            dependentId: notePrereqs.dependentId,
          })
          .from(notePrereqs)
          .where(inArray(notePrereqs.dependentId, ids))
          .all()
      ).filter((e) => ids.includes(e.prereqId))
    : [];

  const nodes = deckNotes.map((note) => {
    const { content, type } = parseStoredContent(note.type, note.content);
    const display = noteDisplay(type, content);
    return {
      id: note.id,
      front: display.front,
      back: display.back,
      type,
      state: minStateByNote.get(note.id) ?? 0,
      locked: note.locked,
      x: note.posX,
      y: note.posY,
    };
  });
  return { nodes, edges };
}

export type NodePlacement = { noteId: string; x: number; y: number };

/**
 * Persist canvas positions for a deck's notes. Only the supplied notes are
 * touched, so callers can save a single dragged node or the whole layout.
 */
export async function saveLayout(
  ctx: ServiceContext,
  deckId: string,
  placements: NodePlacement[],
): Promise<void> {
  if (placements.length === 0) return;
  const ids = placements.map((p) => p.noteId);
  const owned = await ctx.db
    .select({ id: notes.id })
    .from(notes)
    .where(and(eq(notes.deckId, deckId), inArray(notes.id, ids)))
    .all();
  const ownedIds = new Set(owned.map((n) => n.id));
  const toWrite = placements.filter((p) => ownedIds.has(p.noteId));
  if (toWrite.length === 0) return;
  await ctx.db.transaction(async (tx) => {
    for (const p of toWrite) {
      await tx
        .update(notes)
        .set({ posX: p.x, posY: p.y })
        .where(eq(notes.id, p.noteId))
        .run();
    }
  });
}
