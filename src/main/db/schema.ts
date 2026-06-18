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
 * A flashcard is the authored unit the user creates and edits. It owns the
 * content (a type-specific JSON blob), tags, prerequisite edges, the graph
 * position and the lock state. A flashcard generates one or more
 * {@link reviewUnits} review units.
 */
export const flashcards = sqliteTable(
  "flashcards",
  {
    id: uuid(),
    deckId: text("deck_id")
      .notNull()
      .references(() => decks.id, { onDelete: "cascade" }),
    /** One of FlashcardType: basic | basic_reversed | cloze | type_answer | image_occlusion. */
    type: text("type").notNull().default("basic"),
    /** Type-specific content, serialized as JSON. */
    content: text("content").notNull(),

    /** Persisted prerequisite-graph canvas position; null until placed. */
    posX: real("pos_x"),
    posY: real("pos_y"),
    /** Denormalized prerequisite lock; synced when graph or prereq FSRS changes. */
    locked: integer("locked", { mode: "boolean" }).notNull().default(false),
    /** When true, excluded from review queues but still visible in browse/deck. */
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("flashcards_deck_id_idx").on(t.deckId),
    index("flashcards_deck_created_idx").on(t.deckId, t.createdAt),
    index("flashcards_deck_locked_idx").on(t.deckId, t.locked),
  ],
);

/**
 * A review unit is a generated review item belonging to a {@link flashcards}
 * row. It holds the FSRS scheduling state inline, mirroring the `Card` shape
 * from `ts-fsrs`, plus the cached rendered display strings for this review unit.
 */
export const reviewUnits = sqliteTable(
  "review_units",
  {
    id: uuid(),
    flashcardId: text("flashcard_id")
      .notNull()
      .references(() => flashcards.id, { onDelete: "cascade" }),
    deckId: text("deck_id")
      .notNull()
      .references(() => decks.id, { onDelete: "cascade" }),
    /** Stable per-flashcard key identifying which review unit this is (e.g. "", "rev", "c1"). */
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
    /** Mirror of the owning flashcard's lock; queue filters on this. */
    locked: integer("locked", { mode: "boolean" }).notNull().default(false),
    /** Mirror of the owning flashcard's archive flag; queue filters on this. */
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("review_units_deck_id_idx").on(t.deckId),
    index("review_units_flashcard_id_idx").on(t.flashcardId),
    index("review_units_deck_created_idx").on(t.deckId, t.createdAt),
    index("review_units_deck_due_idx").on(t.deckId, t.due),
    index("review_units_deck_state_idx").on(t.deckId, t.state),
    index("review_units_deck_locked_idx").on(t.deckId, t.locked),
    index("review_units_deck_archived_idx").on(t.deckId, t.archived),
  ],
);

/**
 * Prerequisite edges forming the knowledge DAG between flashcards: `prereqId`
 * must be learned before `dependentId` becomes reviewable.
 */
export const flashcardPrereqs = sqliteTable(
  "flashcard_prereqs",
  {
    prereqId: text("prereq_id")
      .notNull()
      .references(() => flashcards.id, { onDelete: "cascade" }),
    dependentId: text("dependent_id")
      .notNull()
      .references(() => flashcards.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.prereqId, t.dependentId] }),
    index("flashcard_prereqs_dependent_idx").on(t.dependentId),
    index("flashcard_prereqs_prereq_idx").on(t.prereqId),
  ],
);

/** Append-only history of every review (mirrors ts-fsrs `ReviewLog`). */
export const reviewLogs = sqliteTable("review_logs", {
  id: uuid(),
  reviewUnitId: text("review_unit_id")
    .notNull()
    .references(() => reviewUnits.id, { onDelete: "cascade" }),
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

export const flashcardTags = sqliteTable(
  "flashcard_tags",
  {
    flashcardId: text("flashcard_id")
      .notNull()
      .references(() => flashcards.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.flashcardId, t.tagId] }),
    index("flashcard_tags_tag_id_idx").on(t.tagId),
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
  /** Max brand-new review units introduced per calendar day (frontier cap). */
  newReviewUnitsPerDay: integer("new_review_units_per_day")
    .notNull()
    .default(10),
  /** Admit all eligible new review units for a flashcard together. */
  keepSiblingReviewUnitsTogether: integer("keep_sibling_review_units_together", {
    mode: "boolean",
  })
    .notNull()
    .default(true),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export type Deck = typeof decks.$inferSelect;
export type NewDeck = typeof decks.$inferInsert;
export type Flashcard = typeof flashcards.$inferSelect;
export type NewFlashcard = typeof flashcards.$inferInsert;
export type ReviewUnit = typeof reviewUnits.$inferSelect;
export type NewReviewUnit = typeof reviewUnits.$inferInsert;
export type ReviewLog = typeof reviewLogs.$inferSelect;
export type Settings = typeof settings.$inferSelect;
export type Tag = typeof tags.$inferSelect;
