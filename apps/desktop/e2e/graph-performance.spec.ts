import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { ElectronApplication } from "playwright";
import {
  closeArmin,
  firstWindow,
  isE2eBuildAvailable,
  launchArmin,
  mainEntryPath,
  waitForMainWindow,
} from "./helpers/electron";

test.beforeAll(() => {
  test.skip(
    !isE2eBuildAvailable(),
    `Vite build missing at ${mainEntryPath()}. Run npm run test:e2e:build first.`,
  );
});

async function createProfile(
  app: ElectronApplication,
  page: Page,
  name: string,
): Promise<Page> {
  await expect(page.getByRole("heading", { name: "Open profile" })).toBeVisible(
    { timeout: 30_000 },
  );

  await page
    .getByRole("button", { name: "Create profile" })
    .first()
    .dispatchEvent("click");
  await page.getByLabel("Profile name").fill(name);
  await page
    .locator("form")
    .getByRole("button", { name: "Create profile", exact: true })
    .dispatchEvent("click");

  const mainPage = await waitForMainWindow(app);
  await expect(
    mainPage.getByRole("heading", { name: "Decks", exact: true }),
  ).toBeVisible();
  return mainPage;
}

async function seedGraph(
  page: Page,
  cardCount: number,
  edgeCount: number,
  contentRepeat: number,
): Promise<string> {
  return page.evaluate(
    async ({ cardCount, edgeCount, contentRepeat }) => {
      const longFront = "with enough explanatory text to exercise DOM layout ";
      const longBack =
        "with a longer answer body and markdown-like **syntax** ";

      // A prerequisite graph is bound to a single deck, so the whole synthetic
      // load lives in one deck and every edge connects two of its cards.
      const { deckId } = await window.armin.import.createDeckWithFlashcards({
        name: "Graph Perf",
        flashcards: Array.from({ length: cardCount }, (_, index) => ({
          front: `Synthetic graph card ${index} ${longFront.repeat(contentRepeat)}`,
          back: `Back ${index} ${longBack.repeat(contentRepeat)}`,
        })),
      });

      const cards = await window.armin.flashcards.list(deckId);
      for (let index = 0; index < edgeCount; index++) {
        await window.armin.graph.addPrereq(cards[index].id, cards[index + 1].id);
      }
      return deckId;
    },
    { cardCount, edgeCount, contentRepeat },
  );
}

async function clearGraphPerfEntries(page: Page) {
  await page.evaluate(() => {
    performance.clearMarks();
    performance.clearMeasures();
  });
}

async function interactiveDurationMs(page: Page) {
  return page.evaluate(() => {
    const entry = performance
      .getEntriesByName("armin:graph:interactive")
      .at(-1);
    return entry?.duration ?? null;
  });
}

test("deck graph opens interactively for a 471-card profile", async () => {
  const cardCount = Number.parseInt(process.env.CARD_COUNT ?? "471", 10);
  const edgeCount = Number.parseInt(process.env.EDGE_COUNT ?? "190", 10);
  const contentRepeat = Number.parseInt(process.env.CONTENT_REPEAT ?? "20", 10);
  const errors: string[] = [];
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "armin-e2e-graph-"));
  const session = await launchArmin(dataDir);

  try {
    const picker = await firstWindow(session.app);
    const page = await createProfile(session.app, picker, "Graph Perf");
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    const deckId = await seedGraph(page, cardCount, edgeCount, contentRepeat);

    await clearGraphPerfEntries(page);
    await page.evaluate((id) => {
      window.location.hash = `#/deck/${id}/graph`;
    }, deckId);
    await expect(page.getByLabel("Search flashcards")).toBeVisible();
    await expect
      .poll(() => interactiveDurationMs(page), { timeout: 15_000 })
      .not.toBeNull();

    const duration = await interactiveDurationMs(page);
    expect(duration).not.toBeNull();
    // Budget tolerant of slower CI runners, which measure ~2-3x local hardware.
    expect(duration!).toBeLessThan(6_000);

    await page.getByRole("link", { name: "Decks" }).dispatchEvent("click");
    await expect(
      page.getByRole("heading", { name: "Decks", exact: true }),
    ).toBeVisible();

    const graph = await page.evaluate(
      (id) => window.armin.graph.getDeck(id),
      deckId,
    );
    expect(graph.nodes).toHaveLength(cardCount);
    expect(graph.edges).toHaveLength(edgeCount);
    expect(errors).toEqual([]);
  } finally {
    await closeArmin(session);
  }
});

test("navigation works while a large graph is still loading", async () => {
  const cardCount = Number.parseInt(process.env.CARD_COUNT ?? "471", 10);
  const edgeCount = Number.parseInt(process.env.EDGE_COUNT ?? "190", 10);
  const contentRepeat = Number.parseInt(process.env.CONTENT_REPEAT ?? "20", 10);
  const errors: string[] = [];
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "armin-e2e-graph-nav-"));
  const session = await launchArmin(dataDir);

  try {
    const picker = await firstWindow(session.app);
    const page = await createProfile(session.app, picker, "Graph Nav");
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    const deckId = await seedGraph(page, cardCount, edgeCount, contentRepeat);

    await clearGraphPerfEntries(page);
    await page.evaluate((id) => {
      window.location.hash = `#/deck/${id}/graph`;
    }, deckId);

    // Immediately leave the route, without waiting for the graph to finish
    // preparing. Graph work must not monopolize the renderer thread, so the
    // surrounding navigation has to stay clickable instead of frozen — whether
    // the build is still running or has already completed.
    await page.getByRole("link", { name: "Decks" }).dispatchEvent("click");

    await expect(
      page.getByRole("heading", { name: "Decks", exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await closeArmin(session);
  }
});
