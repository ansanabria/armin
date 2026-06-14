/**
 * Benchmark deck load paths for large decks.
 *
 * Usage:
 *   CARD_COUNT=500 npm run bench:deck -- --seed
 *   DECK_ID=<id> npm run bench:deck
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import {
  setDbRootForTests,
  initDb,
  closeDb,
  getDb,
} from "../src/main/db/index";
import { runMigrations } from "../src/main/db/migrate";
import { listNotes } from "../src/main/services/notes";
import { listBrowsePage } from "../src/main/services/browse";
import { getDeck } from "../src/main/services/decks";

const seedMode = process.argv.includes("--seed");
const cardCount = Number(process.env.CARD_COUNT ?? 500);
const pageSize = Number(process.env.PAGE_SIZE ?? 30);

let dataDir = process.env.ARMIN_DATA_DIR;
let profileId = process.env.ARMIN_PROFILE_ID ?? "benchmark";
let deckId = process.env.DECK_ID;

if (seedMode) {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "armin-bench-"));
  profileId = "benchmark";
  deckId = randomUUID();
  process.env.ARMIN_DATA_DIR = dataDir;
  process.env.ARMIN_PROFILE_ID = profileId;
} else if (!dataDir) {
  dataDir = `${process.env.HOME}/.config/Armin`;
}

const dbPath = path.join(dataDir!, "profiles", profileId, "armin.db");

function seedDeck(
  client: Database.Database,
  targetDeckId: string,
  count: number,
) {
  const now = Date.now();
  client
    .prepare(
      `INSERT OR IGNORE INTO decks (id, name, description, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      targetDeckId,
      `Benchmark (${count} cards)`,
      "Auto-generated for load benchmarks.",
      now,
      now,
    );

  const tagId = randomUUID();
  client
    .prepare(
      `INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)
          ON CONFLICT(name) DO NOTHING`,
    )
    .run(tagId, "benchmark", now);
  const tagRow = client
    .prepare(`SELECT id FROM tags WHERE name = ?`)
    .get("benchmark") as { id: string };
  const resolvedTagId = tagRow.id;

  const insertNote = client.prepare(
    `INSERT INTO notes (
          id, deck_id, type, content, pos_x, pos_y, locked, created_at, updated_at
        ) VALUES (?, ?, 'basic', ?, NULL, NULL, 0, ?, ?)`,
  );
  const insertCard = client.prepare(
    `INSERT INTO cards (
          id, note_id, deck_id, sub_key, front, back,
          due, stability, difficulty, elapsed_days, scheduled_days,
          learning_steps, reps, lapses, state, last_review,
          created_at, updated_at
        ) VALUES (?, ?, ?, '', ?, ?, ?, 0, 0, 0, 0, 0, 0, 0, 0, NULL, ?, ?)`,
  );
  const insertNoteTag = client.prepare(
    `INSERT INTO note_tags (note_id, tag_id) VALUES (?, ?)`,
  );
  const seedBatch = client.transaction((from: number, to: number) => {
    for (let i = from; i <= to; i++) {
      const noteId = randomUUID();
      const cardId = randomUUID();
      const front = `Card ${i}: benchmark front with **markdown** and \`code\``;
      const back = `Card ${i}: benchmark back answer line two line three`;
      insertNote.run(
        noteId,
        targetDeckId,
        JSON.stringify({ front, back }),
        now,
        now,
      );
      insertCard.run(
        cardId,
        noteId,
        targetDeckId,
        front,
        back,
        now + i,
        now,
        now + i,
      );
      insertNoteTag.run(noteId, resolvedTagId);
    }
  });

  const batchSize = 100;
  for (let start = 1; start <= count; start += batchSize) {
    const end = Math.min(start + batchSize - 1, count);
    seedBatch(start, end);
  }
}

function runRawSqlBenchmarks(client: Database.Database, targetDeckId: string) {
  const timings: Record<string, number> = {};

  let t0 = performance.now();
  client
    .prepare(`SELECT * FROM cards WHERE deck_id = ? ORDER BY created_at`)
    .all(targetDeckId);
  timings.fullListSqlMs = performance.now() - t0;

  t0 = performance.now();
  client
    .prepare(
      `SELECT * FROM cards WHERE deck_id = ? ORDER BY created_at LIMIT ? OFFSET 0`,
    )
    .all(targetDeckId, pageSize);
  timings.firstPageSqlMs = performance.now() - t0;

  t0 = performance.now();
  client
    .prepare(`SELECT COUNT(*) AS n FROM cards WHERE deck_id = ?`)
    .get(targetDeckId);
  timings.countSqlMs = performance.now() - t0;

  return timings;
}

async function runServiceBenchmarks(targetDeckId: string) {
  setDbRootForTests(dataDir!);
  await initDb(profileId);
  await runMigrations(profileId, {
    migrationsFolder: path.join(process.cwd(), "drizzle"),
  });
  const ctx = { profileId, db: getDb(profileId) };

  const timings: Record<string, number> = {};

  let t0 = performance.now();
  await listNotes(ctx, targetDeckId);
  timings.listCardsMs = performance.now() - t0;

  t0 = performance.now();
  await getDeck(ctx, targetDeckId);
  timings.getDeckMs = performance.now() - t0;

  t0 = performance.now();
  await listBrowsePage(ctx, {
    offset: 0,
    limit: pageSize,
    sort: "due-soon",
    deckId: targetDeckId,
  });
  timings.browseFirstPageDueSoonMs = performance.now() - t0;

  t0 = performance.now();
  await listBrowsePage(ctx, {
    offset: 0,
    limit: pageSize,
    sort: "created-new",
    deckId: targetDeckId,
  });
  timings.browseFirstPageCreatedNewMs = performance.now() - t0;

  closeDb();
  setDbRootForTests(null);
  return timings;
}

async function main() {
  if (seedMode) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    setDbRootForTests(dataDir!);
    await initDb(profileId);
    await runMigrations(profileId, {
      migrationsFolder: path.join(process.cwd(), "drizzle"),
    });
    closeDb();
    setDbRootForTests(null);

    const client = new Database(dbPath);
    client.pragma("foreign_keys = ON");
    console.log(`Seeding ${cardCount} cards into ${deckId}…`);
    seedDeck(client, deckId!, cardCount);
    client.close();
  }

  if (!deckId) {
    console.error("Set DECK_ID or pass --seed to create a benchmark deck.");
    process.exit(1);
  }

  if (!fs.existsSync(dbPath)) {
    console.error(`Database not found: ${dbPath}`);
    process.exit(1);
  }

  const client = new Database(dbPath);
  client.pragma("foreign_keys = ON");

  const countRow = client
    .prepare(`SELECT COUNT(*) AS n FROM cards WHERE deck_id = ?`)
    .get(deckId) as { n: number };
  const deckSize = Number(countRow.n);

  console.log(`Benchmark deck: ${deckId}`);
  console.log(`  cards: ${deckSize}`);
  console.log(`  page size: ${pageSize}`);
  console.log("");

  const sqlTimings = runRawSqlBenchmarks(client, deckId);
  client.close();

  const serviceTimings = await runServiceBenchmarks(deckId);

  console.log("SQL timings (ms):");
  for (const [key, ms] of Object.entries(sqlTimings)) {
    console.log(`  ${key}: ${ms.toFixed(1)}`);
  }
  console.log("");
  console.log("Service timings (ms):");
  for (const [key, ms] of Object.entries(serviceTimings)) {
    console.log(`  ${key}: ${ms.toFixed(1)}`);
  }

  if (seedMode) {
    console.log("");
    console.log(`Temp data dir: ${dataDir}`);
    console.log(
      `DECK_ID=${deckId} ARMIN_DATA_DIR=${dataDir} ARMIN_PROFILE_ID=${profileId}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
