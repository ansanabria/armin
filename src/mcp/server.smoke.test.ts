import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let dataDir: string;
let transport: StdioClientTransport | null = null;
let client: Client | null = null;

function parseToolText(result: {
  content: Array<{ type: string; text?: string }>;
}) {
  const text = result.content.find((c) => c.type === "text")?.text;
  if (!text) throw new Error("Missing tool text content");
  return JSON.parse(text) as Record<string, unknown>;
}

beforeEach(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "armin-mcp-"));
  transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", "src/mcp/server.ts"],
    env: {
      ...process.env,
      ARMIN_DATA_DIR: dataDir,
      ARMIN_PROFILE_ID: "mcp-smoke",
    },
    cwd: process.cwd(),
  });

  client = new Client({ name: "armin-test", version: "1.0.0" });
  await client.connect(transport);
});

afterEach(async () => {
  await client?.close();
  client = null;
  transport = null;
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("MCP stdio server", () => {
  it("exposes tools and supports the core agent workflow", async () => {
    const tools = await client!.listTools();
    const names = tools.tools.map((tool) => tool.name).sort();
    expect(names).toEqual([
      "add_prerequisite",
      "create_card",
      "create_deck",
      "get_card",
      "get_deck_graph",
      "import_card_hierarchy",
      "list_cards",
      "list_decks",
    ]);

    const emptyDecks = parseToolText(
      await client!.callTool({ name: "list_decks", arguments: {} }),
    );
    expect(emptyDecks.decks).toEqual([]);

    const createdDeck = parseToolText(
      await client!.callTool({
        name: "create_deck",
        arguments: { name: "MCP Deck", description: "Smoke test" },
      }),
    );
    const deckId = (createdDeck.deck as { id: string }).id;

    const createdCard = parseToolText(
      await client!.callTool({
        name: "create_card",
        arguments: {
          deckId,
          front: "What is MCP?",
          back: "Model Context Protocol",
        },
      }),
    );
    const cardId = (createdCard.card as { id: string }).id;

    const imported = parseToolText(
      await client!.callTool({
        name: "import_card_hierarchy",
        arguments: {
          deckName: "Hierarchy Deck",
          cards: [
            { clientId: "base", front: "Base", back: "Foundation" },
            {
              clientId: "next",
              front: "Next",
              back: "Builds on base",
              prerequisites: ["base"],
            },
          ],
        },
      }),
    );
    const hierarchyDeckId = (imported.deck as { id: string }).id;
    const baseId = (
      imported.cards as Array<{ clientId: string; id: string }>
    ).find((c) => c.clientId === "base")!.id;
    const nextId = (
      imported.cards as Array<{ clientId: string; id: string }>
    ).find((c) => c.clientId === "next")!.id;

    await client!.callTool({
      name: "add_prerequisite",
      arguments: { prereqId: cardId, dependentId: nextId },
    });

    const listed = parseToolText(
      await client!.callTool({
        name: "list_cards",
        arguments: { deckId: hierarchyDeckId },
      }),
    );
    expect((listed.cards as unknown[]).length).toBeGreaterThanOrEqual(2);

    const fetched = parseToolText(
      await client!.callTool({
        name: "get_card",
        arguments: { id: baseId },
      }),
    );
    expect((fetched.card as { front: string }).front).toBe("Base");

    const graph = parseToolText(
      await client!.callTool({
        name: "get_deck_graph",
        arguments: { deckId: hierarchyDeckId },
      }),
    );
    const edges = (graph.graph as { edges: unknown[] }).edges;
    expect(edges.length).toBeGreaterThanOrEqual(1);

    const allDecks = parseToolText(
      await client!.callTool({ name: "list_decks", arguments: {} }),
    );
    expect((allDecks.decks as unknown[]).length).toBeGreaterThanOrEqual(2);
  });
});
