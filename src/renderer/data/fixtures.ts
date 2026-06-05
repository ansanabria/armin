/**
 * UI-PREVIEW FIXTURES — not part of the product.
 *
 * Stand-in data so the UI renders every visual state without a backend.
 * Shapes mirror the real `window.armin` return types closely enough that
 * wiring the backend later is a source swap, not a rewrite.
 */
import type { CardState } from "@/components/ui/badge";
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

export type UiCard = {
  id: string;
  front: string;
  back: string;
  state: CardState;
  locked: boolean;
  dueLabel: string;
};

export type UiReviewCard = {
  id: string;
  front: string;
  back: string;
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
    description: "Caching, queues, replication, and the trade-offs between them.",
    total: 22,
    due: 0,
    newCount: 8,
    learning: 0,
    learned: 9,
  },
  {
    id: "rust",
    name: "Rust Ownership",
    description: "Borrowing, lifetimes, and making peace with the borrow checker.",
    total: 18,
    due: 0,
    newCount: 18,
    learning: 0,
    learned: 0,
  },
];

/** Cards keyed by deck id for preview navigation between decks. */
export const deckCardsByDeck: Record<string, UiCard[]> = {
  js: [
  {
    id: "c1",
    front: "What does `typeof null` return?",
    back: '`"object"` — a long-standing bug kept for backwards compatibility.',
    state: 2,
    locked: false,
    dueLabel: "in 9 days",
  },
  {
    id: "c2",
    front: "What is the temporal dead zone?",
    back: "The span between entering scope and a `let`/`const` declaration being initialized, where accessing the binding throws.",
    state: 2,
    locked: false,
    dueLabel: "in 3 days",
  },
  {
    id: "c3",
    front: "How does the event loop order microtasks vs macrotasks?",
    back: "All queued microtasks (promises) drain after each macrotask (timers, I/O) and before the next one.",
    state: 1,
    locked: false,
    dueLabel: "Due now",
  },
  {
    id: "c4",
    front: "What is a closure?",
    back: "A function bundled with references to its surrounding lexical scope, so it keeps access to those variables after the outer function returns.",
    state: 0,
    locked: false,
    dueLabel: "New",
  },
  {
    id: "c5",
    front: "Explain prototypal inheritance.",
    back: "Objects delegate property lookups to their prototype, forming a chain that ends at `Object.prototype` (then `null`).",
    state: 3,
    locked: false,
    dueLabel: "Due now",
  },
  {
    id: "c6",
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
      front: "What is a discriminated union?",
      back: "A union type where a shared literal field (the discriminant) lets TypeScript narrow each member safely.",
      state: 2,
      locked: false,
      dueLabel: "Due now",
    },
    {
      id: "t2",
      front: "When does `unknown` beat `any`?",
      back: "When you must validate or narrow before use — `unknown` forces the check; `any` skips the type system.",
      state: 1,
      locked: false,
      dueLabel: "in 6m",
    },
    {
      id: "t3",
      front: "What does `satisfies` do?",
      back: "Checks that a value matches a type while preserving the value's inferred literal types, unlike an annotation.",
      state: 0,
      locked: false,
      dueLabel: "New",
    },
    {
      id: "t4",
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
      front: "¿Cómo se dice \"I would like\" politely?",
      back: "Me gustaría — softer than quiero for requests in restaurants and shops.",
      state: 2,
      locked: false,
      dueLabel: "Due now",
    },
    {
      id: "e2",
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

export function getDeckCards(deckId: string): UiCard[] {
  return deckCardsByDeck[deckId] ?? [];
}

export function getDeck(deckId: string): UiDeck | undefined {
  return decks.find((d) => d.id === deckId);
}

/** First deck with cards due today — for the global "Start review" shortcut. */
export function firstDeckWithDue(): UiDeck | undefined {
  return decks.find((d) => d.due > 0);
}

export const reviewQueueByDeck: Record<string, UiReviewCard[]> = {
  js: [
  {
    id: "r1",
    front: "How does the event loop order microtasks vs macrotasks?",
    back: "All queued microtasks (promises) drain after each macrotask (timers, I/O) and before the next one is taken.",
  },
  {
    id: "r2",
    front: "Explain prototypal inheritance.",
    back: "Objects delegate property lookups to their prototype, forming a chain that ends at `Object.prototype`, then `null`.",
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
      front: "¿Cómo se dice \"I would like\" politely?",
      back: "Me gustaría — softer than quiero for requests in restaurants and shops.",
    },
  ],
};

/** @deprecated Use `getReviewQueue(deckId)` */
export const reviewQueue = reviewQueueByDeck.js;

export function getReviewQueue(deckId: string): UiReviewCard[] {
  return reviewQueueByDeck[deckId] ?? [];
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
  theme: "system" as "light" | "system",
  mcpEnabled: true,
  mcpPort: 4117,
};

export const totalDueToday = decks.reduce((sum, d) => sum + d.due, 0);
