import { and, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { schema } from "../db";
import type { ServiceContext } from "./context";
import { toReviewQueueItems, type ReviewQueueItem } from "./review";

const { reviewUnits, flashcards, flashcardTags, tags, flashcardPrereqs, decks } =
  schema;

/** How the deck and tag filters combine when both are supplied. */
export type CramCombine = "intersection" | "union";

export type CramScope = {
  deckIds?: string[];
  tags?: string[];
  combine?: CramCombine;
};

/**
 * A flashcard and the review units it generates. Cram clears a flashcard only
 * when every one of these review units has been answered correctly, which is
 * what unlocks its dependents in graph-follow mode.
 */
export type CramFlashcardGroup = {
  flashcardId: string;
  reviewUnitIds: string[];
};

/**
 * Everything a cram session needs, computed read-only. The ephemeral drill
 * progression (clearing, re-queueing, graph-follow unlocking) runs entirely in
 * the renderer; nothing here mutates FSRS state or the prerequisite graph.
 */
export type CramPool = {
  units: ReviewQueueItem[];
  flashcards: CramFlashcardGroup[];
  /** Prerequisite edges with BOTH endpoints inside the scope. */
  edges: { prereqId: string; dependentId: string }[];
};

/** SQL predicate matching flashcards in any of the given decks. */
function deckPredicate(deckIds: string[]): SQL | undefined {
  if (deckIds.length === 0) return undefined;
  return inArray(flashcards.deckId, deckIds);
}

/** SQL predicate matching flashcards carrying any of the given tag names. */
function tagPredicate(tagNames: string[]): SQL | undefined {
  if (tagNames.length === 0) return undefined;
  const tagList = sql.join(
    tagNames.map((tag) => sql`${tag}`),
    sql`, `,
  );
  return sql`exists (
    select 1 from ${flashcardTags} ct
    inner join ${tags} t on t.id = ct.tag_id
    where ct.flashcard_id = ${flashcards.id} and t.name in (${tagList})
  )`;
}

/**
 * Resolve a cram scope to the set of in-scope flashcard ids. Deck and tag
 * filters compose by `combine` (intersection = and, union = or); archived
 * flashcards are always excluded regardless of the operator.
 */
export async function resolveCramScope(
  ctx: ServiceContext,
  scope: CramScope,
): Promise<string[]> {
  const deckPred = deckPredicate(scope.deckIds ?? []);
  const tagPred = tagPredicate(scope.tags ?? []);

  let combined: SQL | undefined;
  if (deckPred && tagPred) {
    combined =
      scope.combine === "union" ? or(deckPred, tagPred) : and(deckPred, tagPred);
  } else {
    combined = deckPred ?? tagPred;
  }

  const notArchived = eq(flashcards.archived, false);
  const where = combined ? and(notArchived, combined) : notArchived;

  const rows = ctx.db
    .select({ id: flashcards.id })
    .from(flashcards)
    .where(where)
    .all();
  return rows.map((row) => row.id);
}

/**
 * Build the read-only cram pool for a scope: every review unit of the in-scope
 * flashcards (any state, locked included — cram ignores due/lock entirely),
 * grouped per flashcard, plus the prerequisite edges internal to the scope.
 */
export async function getCramPool(
  ctx: ServiceContext,
  scope: CramScope,
): Promise<CramPool> {
  const flashcardIds = await resolveCramScope(ctx, scope);
  if (flashcardIds.length === 0) {
    return { units: [], flashcards: [], edges: [] };
  }

  const inScope = new Set(flashcardIds);
  const rows = ctx.db
    .select({ reviewUnit: reviewUnits, deckName: decks.name })
    .from(reviewUnits)
    .innerJoin(decks, eq(reviewUnits.deckId, decks.id))
    .where(inArray(reviewUnits.flashcardId, flashcardIds))
    .all();
  const unitRows = rows.map(({ reviewUnit }) => reviewUnit);

  // Surface the owning deck on every unit so cross-deck/tag sessions can show
  // which deck the current card belongs to (mirrors getGlobalQueue).
  const deckNameByReviewUnitId = new Map(
    rows.map(({ reviewUnit, deckName }) => [reviewUnit.id, deckName]),
  );
  const units = await toReviewQueueItems(ctx, unitRows, deckNameByReviewUnitId);

  const groups = new Map<string, string[]>();
  for (const unit of unitRows) {
    const list = groups.get(unit.flashcardId) ?? [];
    list.push(unit.id);
    groups.set(unit.flashcardId, list);
  }

  const edgeRows = ctx.db
    .select({
      prereqId: flashcardPrereqs.prereqId,
      dependentId: flashcardPrereqs.dependentId,
    })
    .from(flashcardPrereqs)
    .where(inArray(flashcardPrereqs.dependentId, flashcardIds))
    .all();
  const edges = edgeRows.filter(
    (edge) => inScope.has(edge.prereqId) && inScope.has(edge.dependentId),
  );

  return {
    units,
    flashcards: [...groups.entries()].map(([flashcardId, reviewUnitIds]) => ({
      flashcardId,
      reviewUnitIds,
    })),
    edges,
  };
}
