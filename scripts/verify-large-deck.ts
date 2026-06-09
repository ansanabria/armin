/**
 * Smoke-test large-deck paging, tags, and stats through the service layer.
 *
 * Usage: CARD_COUNT=1500 npx tsx scripts/verify-large-deck.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@libsql/client";
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
  const client = createClient({ url: `file:${dbPath}` });
  await client.execute("PRAGMA foreign_keys = ON;");
  const now = Date.now();

  await client.execute({
    sql: `INSERT INTO decks (id, name, description, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)`,
    args: [deckId, `Verify (${count} cards)`, null, now, now],
  });

  const tagId = randomUUID();
  await client.execute({
    sql: `INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)`,
    args: [tagId, "large", now],
  });

  for (let start = 1; start <= count; start += 100) {
    const end = Math.min(start + 99, count);
    const stmts = [];
    for (let i = start; i <= end; i++) {
      const id = randomUUID();
      stmts.push({
        sql: `INSERT INTO cards (
          id, deck_id, front, back, type, due, stability, difficulty,
          elapsed_days, scheduled_days, learning_steps, reps, lapses, state,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'basic', ?, 0, 0, 0, 0, 0, 0, 0, 0, ?, ?)`,
        args: [id, deckId, `Front ${i}`, `Back ${i}`, now, now + i, now + i],
      });
      if (i % 10 === 0) {
        stmts.push({
          sql: `INSERT INTO card_tags (card_id, tag_id) VALUES (?, ?)`,
          args: [id, tagId],
        });
      }
    }
    await client.batch(stmts);
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
    tag: "large",
  });
  const tags = await listDeckTagNames(ctx, deckId);

  const expectedTagged = Math.floor(count / 10);
  const checks: [string, boolean][] = [
    ["deck.total", deck?.total === count],
    ["page1.count", page1.cards.length === BROWSE_PAGE_SIZE],
    ["page1.filteredTotal", page1.filteredTotal === count],
    ["pageMid.count", pageMid.cards.length === BROWSE_PAGE_SIZE],
    ["pageLast.count", pageLast.cards.length === BROWSE_PAGE_SIZE],
    ["dueSoon.count", dueSoon.cards.length === BROWSE_PAGE_SIZE],
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
  console.log(`Page 1 newest: ${page1.cards[0]?.front}`);
  console.log(`Page last: ${pageLast.cards[0]?.front}`);
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
