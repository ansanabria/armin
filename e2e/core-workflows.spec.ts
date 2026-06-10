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
} from "./helpers/electron";

test.beforeAll(() => {
  test.skip(
    !isE2eBuildAvailable(),
    `Vite build missing at ${mainEntryPath()}. Run npm run test:e2e:build first.`,
  );
});

async function expectDecksPage(page: Page) {
  await expect(
    page.getByRole("heading", { name: "Decks", exact: true }),
  ).toBeVisible();
}

async function createProfile(
  app: ElectronApplication,
  page: Page,
  name: string,
): Promise<Page> {
  await expect(page.getByRole("heading", { name: "Open profile" })).toBeVisible(
    {
      timeout: 30_000,
    },
  );

  const createButtons = page.getByRole("button", { name: "Create profile" });
  await createButtons.first().click({ force: true });
  await expect(
    page.getByRole("heading", { name: "Create profile" }),
  ).toBeVisible();
  await page.getByLabel("Profile name").fill(name);

  const mainWindowPromise = app.waitForEvent("window");
  await page
    .locator("form")
    .getByRole("button", { name: "Create profile", exact: true })
    .click({ force: true });
  const mainPage = await mainWindowPromise;
  await expectDecksPage(mainPage);
  return mainPage;
}

async function openProfile(
  app: ElectronApplication,
  page: Page,
  name: string,
): Promise<Page> {
  await expect(page.getByRole("heading", { name: "Open profile" })).toBeVisible(
    {
      timeout: 30_000,
    },
  );
  await expect(page.getByRole("option", { name })).toBeVisible();

  const mainWindowPromise = app.waitForEvent("window");
  await page
    .getByRole("button", { name: "Open profile" })
    .click({ force: true });
  const mainPage = await mainWindowPromise;
  await expectDecksPage(mainPage);
  return mainPage;
}

async function createDeck(page: Page, name: string, description?: string) {
  await page.getByRole("button", { name: "New deck" }).click({ force: true });

  const dialog = page.getByRole("dialog", { name: "New deck" });
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder("e.g. JavaScript Fundamentals").fill(name);
  if (description) {
    await dialog
      .getByPlaceholder("What this deck covers (optional)")
      .fill(description);
  }
  await dialog
    .getByRole("button", { name: "Create deck" })
    .click({ force: true });
  await expect(dialog).toBeHidden();

  await expect(page.getByRole("link", { name })).toBeVisible();
  const deckId = await page.evaluate(async (deckName) => {
    const decks = await window.armin.decks.list();
    return decks.find((deck) => deck.name === deckName)?.id ?? "";
  }, name);
  expect(deckId).not.toBe("");
  return deckId;
}

async function openDeck(page: Page, name: string) {
  await page.getByRole("link", { name }).first().click({ force: true });
  await expect(page.getByText("All decks")).toBeVisible();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}

async function addCardThroughUi(
  page: Page,
  deckId: string,
  {
    front,
    back,
    tags = [],
  }: {
    front: string;
    back: string;
    tags?: string[];
  },
) {
  await page
    .getByRole("button", { name: "Add card", exact: true })
    .click({ force: true });

  const dialog = page.getByRole("dialog", { name: "Add card" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Card front").fill(front);
  await dialog.getByLabel("Card back").fill(back);

  for (const tag of tags) {
    await dialog.getByLabel("Add tag").fill(tag);
    await dialog.getByLabel("Add tag").press("Enter");
  }

  await dialog.getByRole("button", { name: /Add card/ }).click({ force: true });
  await expect(dialog).toBeVisible();

  let cardId = "";
  await expect(async () => {
    cardId = await page.evaluate(
      async ({ id, expectedFront, expectedBack, expectedTags }) => {
        const cards = await window.armin.cards.list(id);
        const card = cards.find(
          (candidate) =>
            candidate.front === expectedFront &&
            candidate.back === expectedBack &&
            expectedTags.every((tag) => candidate.tags.includes(tag)),
        );
        return card?.id ?? "";
      },
      {
        id: deckId,
        expectedFront: front,
        expectedBack: back,
        expectedTags: tags,
      },
    );
    expect(cardId).not.toBe("");
  }).toPass();

  await dialog
    .getByRole("button", { name: "Close dialog" })
    .click({ force: true });
  await expect(dialog).toBeHidden();

  return cardId;
}

async function expectReviewCompleted(
  page: Page,
  cardId: string,
  deckId: string,
) {
  await expect(
    page.getByRole("heading", { name: "All caught up" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(async (id) => {
        // A reviewed note leaves the New state (0); aggregate state reflects it.
        const card = await window.armin.cards.get(id);
        return card && card.state !== 0 ? 1 : 0;
      }, cardId),
    )
    .toBe(1);
  await expect
    .poll(() =>
      page.evaluate(
        (id) => window.armin.review.queue(id).then((queue) => queue.length),
        deckId,
      ),
    )
    .toBe(0);
}

test.describe("core workflows", () => {
  test("creates a profile and persists it across relaunch", async () => {
    const dataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "armin-e2e-profile-"),
    );
    let session = await launchArmin(dataDir);

    try {
      const picker = await firstWindow(session.app);
      await createProfile(session.app, picker, "E2E Learner");
      await session.app.close();

      session = await launchArmin(dataDir);
      const relaunch = await firstWindow(session.app);
      await openProfile(session.app, relaunch, "E2E Learner");
    } finally {
      await closeArmin(session);
    }
  });

  test("creates a deck, card, and completes a review session", async () => {
    const session = await launchArmin();
    try {
      const picker = await firstWindow(session.app);
      const page = await createProfile(session.app, picker, "Review Flow");

      const deckId = await createDeck(
        page,
        "E2E Deck",
        "Created by the E2E workflow.",
      );
      await openDeck(page, "E2E Deck");

      const cardId = await addCardThroughUi(page, deckId, {
        front: "What is 2 + 2?",
        back: "4",
        tags: ["e2e"],
      });
      await expect(page.getByText("What is 2 + 2?")).toBeVisible();

      await page
        .getByRole("button", { name: "Review", exact: true })
        .click({ force: true });
      await expect(page.getByText("What is 2 + 2?")).toBeVisible();
      await page
        .getByRole("button", { name: /Show answer/ })
        .click({ force: true });
      await expect(
        page.getByRole("paragraph").filter({ hasText: "4" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Good" }).click({ force: true });
      await expectReviewCompleted(page, cardId, deckId);
    } finally {
      await closeArmin(session);
    }
  });
});
