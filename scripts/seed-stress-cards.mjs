import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

const profileId =
  process.env.ARMIN_PROFILE_ID ?? "95e6ebdd-2eb6-4d05-92ea-e711d1330e40";
const dataDir =
  process.env.ARMIN_DATA_DIR ?? `${process.env.HOME}/.config/Armin`;
const dbPath = path.join(dataDir, "profiles", profileId, "armin.db");

if (!fs.existsSync(dbPath)) {
  console.error(`Database not found: ${dbPath}`);
  process.exit(1);
}

const client = new Database(dbPath);
const now = Date.now();
const deckId = randomUUID();
const count = Number(process.env.CARD_COUNT ?? 100);
const deckName = `Stress test (${count} cards)`;

const words = [
  "alpha",
  "beta",
  "gamma",
  "delta",
  "epsilon",
  "zeta",
  "eta",
  "theta",
  "lambda",
  "sigma",
  "omega",
  "nova",
  "quark",
  "photon",
  "nebula",
  "orbit",
  "cipher",
  "vector",
  "matrix",
  "tensor",
  "kernel",
  "buffer",
  "socket",
  "thread",
];

function pickWord() {
  return words[Math.floor(Math.random() * words.length)];
}

client.pragma("foreign_keys = ON");

client
  .prepare(
    `INSERT INTO decks (id, name, description, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)`,
  )
  .run(
    deckId,
    deckName,
    "Auto-generated cards for review session testing.",
    now,
    now,
  );

const tagId = randomUUID();
client
  .prepare(
    `INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)
        ON CONFLICT(name) DO NOTHING`,
  )
  .run(tagId, "stress-test", now);
const tagRow = client
  .prepare(`SELECT id FROM tags WHERE name = ?`)
  .get("stress-test");
const resolvedTagId = tagRow.id;

const insertCard = client.prepare(
  `INSERT INTO cards (
        id, deck_id, front, back, type,
        due, stability, difficulty, elapsed_days, scheduled_days,
        learning_steps, reps, lapses, state, last_review,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'basic', ?, 0, 0, 0, 0, 0, 0, 0, 0, NULL, ?, ?)`,
);
const insertCardTag = client.prepare(
  `INSERT INTO card_tags (card_id, tag_id) VALUES (?, ?)`,
);
const seedCards = client.transaction((from, to) => {
  for (let i = from; i <= to; i++) {
    const cardId = randomUUID();
    const front = `Card ${i}: What is ${pickWord()} × ${pickWord()}?`;
    const back = `Card ${i} answer: ${pickWord()}-${pickWord()}-${i}`;
    insertCard.run(cardId, deckId, front, back, now, now + i, now + i);
    insertCardTag.run(cardId, resolvedTagId);
  }
});

const batchSize = 100;
for (let start = 1; start <= count; start += batchSize) {
  const end = Math.min(start + batchSize - 1, count);
  seedCards(start, end);
}

client
  .prepare(
    `UPDATE settings
        SET new_cards_per_day = MAX(new_cards_per_day, ?), updated_at = ?
        WHERE id = 1`,
  )
  .run(count, now);

const dueRow = client
  .prepare(
    `SELECT COUNT(*) AS n FROM cards
        WHERE deck_id = ? AND reps = 0 AND last_review IS NULL AND due <= ?`,
  )
  .get(deckId, now);

client.close();

console.log(`Created deck "${deckName}"`);
console.log(`  deckId: ${deckId}`);
console.log(`  cards:  ${count}`);
console.log(`  due new cards in deck: ${dueRow.n}`);
console.log(`  new_cards_per_day raised to at least ${count}`);
