import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

const uuid = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID());
const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());
const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());

export const decks = sqliteTable("decks", {
  id: uuid(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * A note is the authored unit the user creates and edits. It owns the content
 * (a type-specific JSON blob), tags, prerequisite edges, the graph position and
 * the lock state. A note generates one or more {@link cards} review items.
 */
export const notes = sqliteTable(
  "notes",
  {
    id: uuid(),
    deckId: text("deck_id")
      .notNull()
      .references(() => decks.id, { onDelete: "cascade" }),
    /** One of CardType: basic | basic_reversed | cloze | type_answer | diagram. */
    type: text("type").notNull().default("basic"),
    /** Type-specific content, serialized as JSON. */
    content: text("content").notNull(),

    /** Persisted prerequisite-graph canvas position; null until placed. */
    posX: real("pos_x"),
    posY: real("pos_y"),
    /** Denormalized prerequisite lock; synced when graph or prereq FSRS changes. */
    locked: integer("locked", { mode: "boolean" }).notNull().default(false),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("notes_deck_id_idx").on(t.deckId),
    index("notes_deck_created_idx").on(t.deckId, t.createdAt),
    index("notes_deck_locked_idx").on(t.deckId, t.locked),
  ],
);

/**
 * A card is a generated review item belonging to a {@link notes} row. It holds
 * the FSRS scheduling state inline, mirroring the `Card` shape from `ts-fsrs`,
 * plus the cached rendered display strings for this review item.
 */
export const cards = sqliteTable(
  "cards",
  {
    id: uuid(),
    noteId: text("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    deckId: text("deck_id")
      .notNull()
      .references(() => decks.id, { onDelete: "cascade" }),
    /** Stable per-note key identifying which review item this is (e.g. "", "fwd", "c1"). */
    subKey: text("sub_key").notNull().default(""),
    front: text("front").notNull(),
    back: text("back").notNull(),

    // --- FSRS state (see ts-fsrs `Card`) ---
    due: integer("due", { mode: "timestamp_ms" }).notNull(),
    stability: real("stability").notNull().default(0),
    difficulty: real("difficulty").notNull().default(0),
    elapsedDays: real("elapsed_days").notNull().default(0),
    scheduledDays: real("scheduled_days").notNull().default(0),
    learningSteps: integer("learning_steps").notNull().default(0),
    reps: integer("reps").notNull().default(0),
    lapses: integer("lapses").notNull().default(0),
    // State enum: 0=New, 1=Learning, 2=Review, 3=Relearning
    state: integer("state").notNull().default(0),
    lastReview: integer("last_review", { mode: "timestamp_ms" }),
    /** Mirror of the owning note's lock; queue filters on this. */
    locked: integer("locked", { mode: "boolean" }).notNull().default(false),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("cards_deck_id_idx").on(t.deckId),
    index("cards_note_id_idx").on(t.noteId),
    index("cards_deck_created_idx").on(t.deckId, t.createdAt),
    index("cards_deck_due_idx").on(t.deckId, t.due),
    index("cards_deck_state_idx").on(t.deckId, t.state),
    index("cards_deck_locked_idx").on(t.deckId, t.locked),
  ],
);

/**
 * Prerequisite edges forming the knowledge DAG between notes: `prereqId` must be
 * learned before `dependentId` becomes reviewable.
 */
export const notePrereqs = sqliteTable(
  "note_prereqs",
  {
    prereqId: text("prereq_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    dependentId: text("dependent_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.prereqId, t.dependentId] }),
    index("note_prereqs_dependent_idx").on(t.dependentId),
    index("note_prereqs_prereq_idx").on(t.prereqId),
  ],
);

/** Append-only history of every review (mirrors ts-fsrs `ReviewLog`). */
export const reviewLogs = sqliteTable("review_logs", {
  id: uuid(),
  cardId: text("card_id")
    .notNull()
    .references(() => cards.id, { onDelete: "cascade" }),
  rating: integer("rating").notNull(),
  state: integer("state").notNull(),
  due: integer("due", { mode: "timestamp_ms" }).notNull(),
  stability: real("stability").notNull(),
  difficulty: real("difficulty").notNull(),
  elapsedDays: real("elapsed_days").notNull(),
  lastElapsedDays: real("last_elapsed_days").notNull(),
  scheduledDays: real("scheduled_days").notNull(),
  learningSteps: integer("learning_steps").notNull(),
  review: integer("review", { mode: "timestamp_ms" }).notNull(),
});

export const tags = sqliteTable("tags", {
  id: uuid(),
  name: text("name").notNull().unique(),
  createdAt: createdAt(),
});

export const noteTags = sqliteTable(
  "note_tags",
  {
    noteId: text("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.noteId, t.tagId] }),
    index("note_tags_tag_id_idx").on(t.tagId),
  ],
);

/** Single-row table holding user-tunable FSRS parameters. */
export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey().default(1),
  requestRetention: real("request_retention").notNull().default(0.9),
  maximumInterval: integer("maximum_interval").notNull().default(36500),
  enableFuzz: integer("enable_fuzz", { mode: "boolean" })
    .notNull()
    .default(true),
  enableShortTerm: integer("enable_short_term", { mode: "boolean" })
    .notNull()
    .default(true),
  // Comma-separated step units, e.g. "1m,10m".
  learningSteps: text("learning_steps").notNull().default("1m,10m"),
  relearningSteps: text("relearning_steps").notNull().default("10m"),
  // JSON array of FSRS weights; null = library defaults.
  weights: text("weights"),
  /** Minimum FSRS stability before a prereq counts as secured. */
  prereqStabilityFloor: real("prereq_stability_floor").notNull().default(2),
  /** Max brand-new cards introduced per calendar day (frontier cap). */
  newCardsPerDay: integer("new_cards_per_day").notNull().default(10),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export type Deck = typeof decks.$inferSelect;
export type NewDeck = typeof decks.$inferInsert;
export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;
export type Card = typeof cards.$inferSelect;
export type NewCard = typeof cards.$inferInsert;
export type ReviewLog = typeof reviewLogs.$inferSelect;
export type Settings = typeof settings.$inferSelect;
export type Tag = typeof tags.$inferSelect;
