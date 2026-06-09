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
 * A card holds its content plus the FSRS scheduling state inline, mirroring the
 * `Card` shape from `ts-fsrs` so the scheduler can read/write it directly.
 */
export const cards = sqliteTable(
  "cards",
  {
    id: uuid(),
    deckId: text("deck_id")
      .notNull()
      .references(() => decks.id, { onDelete: "cascade" }),
    front: text("front").notNull(),
    back: text("back").notNull(),
    type: text("type").notNull().default("basic"),

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
    /** Denormalized prerequisite lock; synced when graph or prereq FSRS changes. */
    locked: integer("locked", { mode: "boolean" }).notNull().default(false),

    /** Persisted prerequisite-graph canvas position; null until the card is placed. */
    posX: real("pos_x"),
    posY: real("pos_y"),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("cards_deck_id_idx").on(t.deckId),
    index("cards_deck_created_idx").on(t.deckId, t.createdAt),
    index("cards_deck_due_idx").on(t.deckId, t.due),
    index("cards_deck_state_idx").on(t.deckId, t.state),
    index("cards_deck_locked_idx").on(t.deckId, t.locked),
  ],
);

/**
 * Prerequisite edges forming the knowledge DAG: `prereqId` must be learned
 * before `dependentId` becomes reviewable.
 */
export const cardPrereqs = sqliteTable(
  "card_prereqs",
  {
    prereqId: text("prereq_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    dependentId: text("dependent_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.prereqId, t.dependentId] }),
    index("card_prereqs_dependent_idx").on(t.dependentId),
    index("card_prereqs_prereq_idx").on(t.prereqId),
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

export const cardTags = sqliteTable(
  "card_tags",
  {
    cardId: text("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.cardId, t.tagId] }),
    index("card_tags_tag_id_idx").on(t.tagId),
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
export type Card = typeof cards.$inferSelect;
export type NewCard = typeof cards.$inferInsert;
export type ReviewLog = typeof reviewLogs.$inferSelect;
export type Settings = typeof settings.$inferSelect;
export type Tag = typeof tags.$inferSelect;
