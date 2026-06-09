import fs from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";
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

const client = createClient({ url: `file:${dbPath}` });
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

await client.execute("PRAGMA foreign_keys = ON;");

await client.execute({
  sql: `INSERT INTO decks (id, name, description, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)`,
  args: [
    deckId,
    deckName,
    "Auto-generated cards for review session testing.",
    now,
    now,
  ],
});

const tagId = randomUUID();
await client.execute({
  sql: `INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)
        ON CONFLICT(name) DO NOTHING`,
  args: [tagId, "stress-test", now],
});
const tagRow = await client.execute({
  sql: `SELECT id FROM tags WHERE name = ?`,
  args: ["stress-test"],
});
const resolvedTagId = tagRow.rows[0].id;

const batchSize = 100;
for (let start = 1; start <= count; start += batchSize) {
  const end = Math.min(start + batchSize - 1, count);
  const statements = [];
  for (let i = start; i <= end; i++) {
    const cardId = randomUUID();
    const front = `Card ${i}: What is ${pickWord()} × ${pickWord()}?`;
    const back = `Card ${i} answer: ${pickWord()}-${pickWord()}-${i}`;

    statements.push({
      sql: `INSERT INTO cards (
        id, deck_id, front, back, type,
        due, stability, difficulty, elapsed_days, scheduled_days,
        learning_steps, reps, lapses, state, last_review,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'basic', ?, 0, 0, 0, 0, 0, 0, 0, 0, NULL, ?, ?)`,
      args: [cardId, deckId, front, back, now, now + i, now + i],
    });
    statements.push({
      sql: `INSERT INTO card_tags (card_id, tag_id) VALUES (?, ?)`,
      args: [cardId, resolvedTagId],
    });
  }
  await client.batch(statements);
}

await client.execute({
  sql: `UPDATE settings
        SET new_cards_per_day = MAX(new_cards_per_day, ?), updated_at = ?
        WHERE id = 1`,
  args: [count, now],
});

const dueRow = await client.execute({
  sql: `SELECT COUNT(*) AS n FROM cards
        WHERE deck_id = ? AND reps = 0 AND last_review IS NULL AND due <= ?`,
  args: [deckId, now],
});

client.close();

console.log(`Created deck "${deckName}"`);
console.log(`  deckId: ${deckId}`);
console.log(`  cards:  ${count}`);
console.log(`  due new cards in deck: ${dueRow.rows[0].n}`);
console.log(`  new_cards_per_day raised to at least ${count}`);
