/**
 * Smoke-test large-deck paging, tags, and stats through the service layer.
 *
 * Usage: CARD_COUNT=1500 npx tsx scripts/verify-large-deck.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import {
  setDbRootForTests,
  initDb,
  closeDb,
  getDb,
} from "../src/main/db/index";
import { runMigrations } from "../src/main/db/migrate";
import { listBrowsePage, listDeckTagNames } from "../src/main/services/browse";
import { getDeck } from "../src/main/services/decks";
import { BROWSE_PAGE_SIZE } from "../src/shared/browse";

const count = Number(process.env.CARD_COUNT ?? 1500);

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "armin-verify-"));
  const profileId = "verify";
  const deckId = randomUUID();

  setDbRootForTests(dataDir);
  await initDb(profileId);
  await runMigrations(profileId, {
    migrationsFolder: path.join(process.cwd(), "drizzle"),
  });
  closeDb();
  setDbRootForTests(null);

  const dbPath = path.join(dataDir, "profiles", profileId, "armin.db");
  const client = new Database(dbPath);
  client.pragma("foreign_keys = ON");
  const now = Date.now();

  client
    .prepare(
      `INSERT INTO decks (id, name, description, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)`,
    )
    .run(deckId, `Verify (${count} cards)`, null, now, now);

  const tagId = randomUUID();
  client
    .prepare(`INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)`)
    .run(tagId, "large", now);

  const insertNote = client.prepare(
    `INSERT INTO flashcards (
          id, deck_id, type, content, pos_x, pos_y, locked, created_at, updated_at
        ) VALUES (?, ?, 'basic', ?, NULL, NULL, 0, ?, ?)`,
  );
  const insertCard = client.prepare(
    `INSERT INTO review_units (
          id, flashcard_id, deck_id, sub_key, front, back, due, stability, difficulty,
          elapsed_days, scheduled_days, learning_steps, reps, lapses, state,
          created_at, updated_at
        ) VALUES (?, ?, ?, '', ?, ?, ?, 0, 0, 0, 0, 0, 0, 0, 0, ?, ?)`,
  );
  const insertNoteTag = client.prepare(
    `INSERT INTO flashcard_tags (flashcard_id, tag_id) VALUES (?, ?)`,
  );
  const seedBatch = client.transaction((from: number, to: number) => {
    for (let i = from; i <= to; i++) {
      const noteId = randomUUID();
      const id = randomUUID();
      const front = `Front ${i}`;
      const back = `Back ${i}`;
      insertNote.run(
        noteId,
        deckId,
        JSON.stringify({ front, back }),
        now,
        now + i,
      );
      insertCard.run(id, noteId, deckId, front, back, now + i, now, now + i);
      if (i % 10 === 0) {
        insertNoteTag.run(noteId, tagId);
      }
    }
  });

  for (let start = 1; start <= count; start += 100) {
    const end = Math.min(start + 99, count);
    seedBatch(start, end);
  }
  client.close();

  setDbRootForTests(dataDir);
  await initDb(profileId);
  const ctx = { profileId, db: getDb(profileId) };

  const deck = await getDeck(ctx, deckId);
  const page1 = await listBrowsePage(ctx, {
    offset: 0,
    limit: BROWSE_PAGE_SIZE,
    sort: "created-new",
    deckId,
  });
  const pageMid = await listBrowsePage(ctx, {
    offset: Math.floor(count / 2),
    limit: BROWSE_PAGE_SIZE,
    sort: "created-new",
    deckId,
  });
  const pageLast = await listBrowsePage(ctx, {
    offset: count - BROWSE_PAGE_SIZE,
    limit: BROWSE_PAGE_SIZE,
    sort: "created-new",
    deckId,
  });
  const dueSoon = await listBrowsePage(ctx, {
    offset: 0,
    limit: BROWSE_PAGE_SIZE,
    sort: "due-soon",
    deckId,
  });
  const tagged = await listBrowsePage(ctx, {
    offset: 0,
    limit: BROWSE_PAGE_SIZE,
    sort: "front-asc",
    deckId,
    tags: ["large"],
  });
  const tags = await listDeckTagNames(ctx, deckId);

  const expectedTagged = Math.floor(count / 10);
  const checks: [string, boolean][] = [
    ["deck.total", deck?.total === count],
    ["page1.count", page1.flashcards.length === BROWSE_PAGE_SIZE],
    ["page1.filteredTotal", page1.filteredTotal === count],
    ["pageMid.count", pageMid.flashcards.length === BROWSE_PAGE_SIZE],
    ["pageLast.count", pageLast.flashcards.length === BROWSE_PAGE_SIZE],
    ["dueSoon.count", dueSoon.flashcards.length === BROWSE_PAGE_SIZE],
    ["tagged.filteredTotal", tagged.filteredTotal === expectedTagged],
    ["tags.includes(large)", tags.includes("large")],
  ];

  let failed = 0;
  for (const [name, ok] of checks) {
    console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
    if (!ok) failed += 1;
  }

  console.log("");
  console.log(
    `Deck: ${count} cards, ${deck?.due} due, ${deck?.learned} learned`,
  );
  console.log(`Page 1 newest: ${page1.flashcards[0]?.front}`);
  console.log(`Page last: ${pageLast.flashcards[0]?.front}`);
  console.log(`Tagged cards: ${tagged.filteredTotal}`);

  closeDb();
  setDbRootForTests(null);
  fs.rmSync(dataDir, { recursive: true, force: true });

  if (failed > 0) {
    process.exitCode = 1;
    throw new Error(`${failed} check(s) failed`);
  }

  console.log("");
  console.log(`All checks passed for ${count}-card deck.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
