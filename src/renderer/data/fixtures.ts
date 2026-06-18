/**
 * UI-PREVIEW FIXTURES — not part of the product.
 *
 * Stand-in data so the UI renders every visual state without a backend.
 * Shapes mirror the real `window.armin` return types closely enough that
 * wiring the backend later is a source swap, not a rewrite.
 */
import type { ReviewState } from "@/components/ui/badge";
import type { Grade } from "@/types/window";

export type UiDeck = {
  id: string;
  name: string;
  description: string | null;
  total: number;
  due: number;
  newCount: number;
  learning: number;
  learned: number; // cards graduated to Review state
};

export type UiFlashcard = {
  id: string;
  front: string;
  back: string;
  state: ReviewState;
  locked: boolean;
  dueLabel: string;
  /** ISO date the card was created — for sorting in Browse. */
  createdAt: string;
  /** Free-form labels for grouping/filtering. Optional in preview fixtures. */
  tags?: string[];
};

/** A card paired with the deck it belongs to, for cross-deck browsing. */
export type UiBrowseFlashcard = UiFlashcard & {
  deckId: string;
  deckName: string;
};

export type UiReviewUnit = {
  id: string;
  front: string;
  back: string;
  /** Owning deck — set when reviewing across decks. */
  deck?: string;
  deckId?: string;
};

export const decks: UiDeck[] = [
  {
    id: "js",
    name: "JavaScript Fundamentals",
    description: "The language under everything: types, scope, the event loop.",
    total: 48,
    due: 12,
    newCount: 6,
    learning: 4,
    learned: 31,
  },
  {
    id: "ts",
    name: "TypeScript",
    description: "Types on top of JavaScript. Generics, narrowing, inference.",
    total: 36,
    due: 5,
    newCount: 9,
    learning: 2,
    learned: 18,
  },
  {
    id: "es",
    name: "Spanish Vocabulary",
    description: "Everyday words and the phrasing that makes them stick.",
    total: 120,
    due: 23,
    newCount: 0,
    learning: 7,
    learned: 96,
  },
  {
    id: "sd",
    name: "System Design",
    description:
      "Caching, queues, replication, and the trade-offs between them.",
    total: 22,
    due: 0,
    newCount: 8,
    learning: 0,
    learned: 9,
  },
  {
    id: "rust",
    name: "Rust Ownership",
    description:
      "Borrowing, lifetimes, and making peace with the borrow checker.",
    total: 18,
    due: 0,
    newCount: 18,
    learning: 0,
    learned: 0,
  },
];

/** Cards keyed by deck id for preview navigation between decks. */
export const deckCardsByDeck: Record<string, UiFlashcard[]> = {
  js: [
    {
      id: "c1",
      createdAt: "2025-08-12",
      front: "What does `typeof null` return?",
      back: '`"object"` — a long-standing bug kept for backwards compatibility.',
      state: 2,
      locked: false,
      dueLabel: "in 9 days",
      tags: ["types", "gotchas"],
    },
    {
      id: "c2",
      createdAt: "2025-08-15",
      front: "What is the temporal dead zone?",
      back: "The span between entering scope and a `let`/`const` declaration being initialized, where accessing the binding throws.",
      state: 2,
      locked: false,
      dueLabel: "in 3 days",
    },
    {
      id: "c3",
      createdAt: "2025-09-02",
      front: "How does the event loop order microtasks vs macrotasks?",
      back: "All queued microtasks (promises) drain after each macrotask (timers, I/O) and before the next one.",
      state: 1,
      locked: false,
      dueLabel: "Due now",
    },
    {
      id: "c4",
      createdAt: "2025-09-20",
      front: "What is a closure?",
      back: "A function bundled with references to its surrounding lexical scope, so it keeps access to those variables after the outer function returns.",
      state: 0,
      locked: false,
      dueLabel: "New",
      tags: ["scope", "fundamentals"],
    },
    {
      id: "c5",
      createdAt: "2025-08-28",
      front: "Explain prototypal inheritance.",
      back: "Objects delegate property lookups to their prototype, forming a chain that ends at `Object.prototype` (then `null`).",
      state: 3,
      locked: false,
      dueLabel: "Due now",
    },
    {
      id: "c6",
      createdAt: "2025-10-05",
      front: "When should you reach for a `WeakMap`?",
      back: "When keys are objects whose entries should be garbage-collected once nothing else references the key. Requires closures first.",
      state: 0,
      locked: true,
      dueLabel: "Locked",
    },
  ],
  ts: [
    {
      id: "t1",
      createdAt: "2025-09-10",
      front: "What is a discriminated union?",
      back: "A union type where a shared literal field (the discriminant) lets TypeScript narrow each member safely.",
      state: 2,
      locked: false,
      dueLabel: "Due now",
      tags: ["narrowing", "unions"],
    },
    {
      id: "t2",
      createdAt: "2025-09-12",
      front: "When does `unknown` beat `any`?",
      back: "When you must validate or narrow before use — `unknown` forces the check; `any` skips the type system.",
      state: 1,
      locked: false,
      dueLabel: "in 6m",
    },
    {
      id: "t3",
      createdAt: "2025-10-01",
      front: "What does `satisfies` do?",
      back: "Checks that a value matches a type while preserving the value's inferred literal types, unlike an annotation.",
      state: 0,
      locked: false,
      dueLabel: "New",
    },
    {
      id: "t4",
      createdAt: "2025-10-08",
      front: "Explain variance in function parameter types.",
      back: "Parameters are contravariant and returns covariant under strictFunctionTypes; getting this wrong breaks assignability.",
      state: 0,
      locked: true,
      dueLabel: "Locked",
    },
  ],
  es: [
    {
      id: "e1",
      createdAt: "2025-07-22",
      front: '¿Cómo se dice "I would like" politely?',
      back: "Me gustaría — softer than quiero for requests in restaurants and shops.",
      state: 2,
      locked: false,
      dueLabel: "Due now",
    },
    {
      id: "e2",
      createdAt: "2025-07-25",
      front: "What's the difference between ser and estar?",
      back: "Ser marks identity and permanence; estar marks state, location, and temporariness.",
      state: 2,
      locked: false,
      dueLabel: "in 2 days",
    },
  ],
  sd: [
    {
      id: "s1",
      createdAt: "2025-10-15",
      front: "When is write-through cache appropriate?",
      back: "When read-after-write consistency matters and write volume is low enough that every write can hit the backing store.",
      state: 0,
      locked: false,
      dueLabel: "New",
    },
  ],
};

/** @deprecated Use `getDeckCards(deckId)` — kept for any stale imports. */
export const deckCards = deckCardsByDeck.js;

export function getDeckCards(deckId: string): UiFlashcard[] {
  return deckCardsByDeck[deckId] ?? [];
}

/** Unique tags present on a deck's cards, alphabetically sorted. */
export function getDeckTags(deckId: string): string[] {
  const tags = new Set<string>();
  for (const card of getDeckCards(deckId)) {
    for (const tag of card.tags ?? []) tags.add(tag);
  }
  return [...tags].sort((a, b) => a.localeCompare(b));
}

/** Every card across every deck, paired with its deck — for Browse. */
export function getAllCards(): UiBrowseFlashcard[] {
  return decks.flatMap((deck) =>
    getDeckCards(deck.id).map((card) => ({
      ...card,
      deckId: deck.id,
      deckName: deck.name,
    })),
  );
}

/** Prerequisite graph — mirrors `DeckGraph` from the main process. */
export type UiGraphNode = {
  id: string;
  front: string;
  back: string;
  state: ReviewState;
  locked: boolean;
};

export type UiGraphEdge = {
  prereqId: string;
  dependentId: string;
};

export type UiDeckGraph = {
  nodes: UiGraphNode[];
  edges: UiGraphEdge[];
};

/** Prerequisite edges keyed by deck id (UI preview only). */
export const deckGraphEdgesByDeck: Record<string, UiGraphEdge[]> = {
  js: [
    { prereqId: "c1", dependentId: "c2" },
    { prereqId: "c2", dependentId: "c4" },
    { prereqId: "c4", dependentId: "c3" },
    { prereqId: "c4", dependentId: "c5" },
    { prereqId: "c4", dependentId: "c6" },
  ],
  ts: [
    { prereqId: "t3", dependentId: "t2" },
    { prereqId: "t2", dependentId: "t4" },
  ],
};

export function getDeckGraph(deckId: string): UiDeckGraph {
  const cards = getDeckCards(deckId);
  return {
    nodes: cards.map((c) => ({
      id: c.id,
      front: c.front,
      back: c.back,
      state: c.state,
      locked: c.locked,
    })),
    edges: deckGraphEdgesByDeck[deckId] ?? [],
  };
}

export function getDeck(deckId: string): UiDeck | undefined {
  return decks.find((d) => d.id === deckId);
}

export const reviewQueueByDeck: Record<string, UiReviewUnit[]> = {
  js: [
    {
      id: "r1",
      front: "How does the event loop order microtasks vs macrotasks?",
      back: "All queued microtasks (promises) drain after each macrotask (timers, I/O) and before the next one is taken.",
    },
    {
      id: "r2",
      front: "Explain **prototypal inheritance**.",
      back: "Objects delegate property lookups to their prototype, forming a chain:\n\n- Own properties are checked **first**\n- Then the object's `[[Prototype]]`\n- The chain ends at `Object.prototype`, then `null`",
    },
    {
      id: "r3",
      front: "What is the temporal dead zone?",
      back: "The span between entering scope and a `let`/`const` being initialized, where touching the binding throws a ReferenceError.",
    },
  ],
  ts: [
    {
      id: "tr1",
      front: "What is a discriminated union?",
      back: "A union type where a shared literal field (the discriminant) lets TypeScript narrow each member safely.",
    },
  ],
  es: [
    {
      id: "er1",
      front: '¿Cómo se dice "I would like" politely?',
      back: "Me gustaría — softer than quiero for requests in restaurants and shops.",
    },
  ],
};

/** @deprecated Use `getReviewQueue(deckId)` */
export const reviewQueue = reviewQueueByDeck.js;

export function getReviewQueue(deckId: string): UiReviewUnit[] {
  return reviewQueueByDeck[deckId] ?? [];
}

/** Every card due across all decks, tagged with its owning deck name. */
export function getGlobalReviewQueue(): UiReviewUnit[] {
  return decks
    .filter((d) => d.due > 0)
    .flatMap((d) =>
      getReviewQueue(d.id).map((c) => ({ ...c, deck: d.name, deckId: d.id })),
    );
}

/** Fake FSRS interval previews per rating, in the order Again/Hard/Good/Easy. */
export const intervalPreview: Record<Grade, string> = {
  1: "<1m",
  2: "8m",
  3: "4d",
  4: "9d",
};

export const settings = {
  requestRetention: 0.9,
  maximumInterval: 36500,
  enableFuzz: true,
  enableShortTerm: true,
  learningSteps: "1m, 10m",
  relearningSteps: "10m",
  prereqStabilityFloor: 2,
  newReviewUnitsPerDay: 10,
  theme: "system" as "flexoki-light" | "flexoki-dark" | "system",
};

export const totalDueToday = decks.reduce((sum, d) => sum + d.due, 0);
