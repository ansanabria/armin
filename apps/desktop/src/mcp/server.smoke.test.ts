import fs from "node:fs";
import { randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { eq } from "drizzle-orm";
import { Rating } from "ts-fsrs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb, initDb, schema } from "../main/db";
import { runMigrations } from "../main/db/migrate";
import type { ServiceContext } from "../main/services/context";
import * as review from "../main/services/review";
import { createArminMcpServer } from "./app";

let dataDir: string;
let transport: StdioClientTransport | null = null;
let client: Client | null = null;
let httpServer: Server | null = null;
let httpTransports: WebStandardStreamableHTTPServerTransport[] = [];
let previousArminDataDir: string | undefined;

// callTool returns a union that includes legacy `toolResult` shapes, so dig
// the text content out defensively instead of typing the whole union.
function parseToolText(result: unknown) {
  const { content } = result as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = content?.find((c) => c.type === "text")?.text;
  if (!text) throw new Error("Missing tool text content");
  return JSON.parse(text) as Record<string, unknown>;
}

function isInitializedNotification(body: unknown) {
  if (Array.isArray(body)) return body.every(isInitializedNotification);
  if (!body || typeof body !== "object") return false;
  const message = body as { id?: unknown; method?: unknown };
  return (
    message.id === undefined && message.method === "notifications/initialized"
  );
}

function isInitializeRequest(body: unknown) {
  if (Array.isArray(body)) return body.some(isInitializeRequest);
  if (!body || typeof body !== "object") return false;
  return (body as { method?: unknown }).method === "initialize";
}

async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return chunks.length === 0 ? undefined : Buffer.concat(chunks);
}

function parseJsonBody(body: Buffer | undefined) {
  if (!body) return undefined;
  return JSON.parse(body.toString("utf8")) as unknown;
}

async function writeWebResponse(res: ServerResponse, response: Response) {
  res.writeHead(response.status, Object.fromEntries(response.headers));
  if (!response.body) {
    res.end();
    return;
  }

  const reader = response.body.getReader();
  let chunk = await reader.read();
  while (!chunk.done) {
    res.write(Buffer.from(chunk.value));
    chunk = await reader.read();
  }
  res.end();
}

async function testServiceContext(): Promise<ServiceContext> {
  await initDb("mcp-smoke");
  await runMigrations("mcp-smoke");
  return { profileId: "mcp-smoke", db: getDb("mcp-smoke") };
}

async function reviewUnitsFor(flashcardId: string) {
  const ctx = await testServiceContext();
  return ctx.db
    .select()
    .from(schema.reviewUnits)
    .where(eq(schema.reviewUnits.flashcardId, flashcardId))
    .all();
}

async function reviewLogsFor(reviewUnitId: string) {
  const ctx = await testServiceContext();
  return ctx.db
    .select()
    .from(schema.reviewLogs)
    .where(eq(schema.reviewLogs.reviewUnitId, reviewUnitId))
    .all();
}

beforeEach(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "armin-mcp-"));
  previousArminDataDir = process.env.ARMIN_DATA_DIR;
  process.env.ARMIN_DATA_DIR = dataDir;
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
  await new Promise<void>((resolve, reject) => {
    if (!httpServer) {
      resolve();
      return;
    }
    httpServer.close((error) => (error ? reject(error) : resolve()));
  });
  httpServer = null;
  await Promise.all(
    httpTransports.map((httpTransport) => httpTransport.close()),
  );
  httpTransports = [];
  closeDb();
  fs.rmSync(dataDir, { recursive: true, force: true });
  if (previousArminDataDir === undefined) {
    delete process.env.ARMIN_DATA_DIR;
  } else {
    process.env.ARMIN_DATA_DIR = previousArminDataDir;
  }
  previousArminDataDir = undefined;
});

describe("MCP stdio server", () => {
  it("exposes tools and supports the core agent workflow", async () => {
    const tools = await client!.listTools();
    const names = tools.tools.map((tool) => tool.name).sort();
    expect(names).toEqual([
      "add_prerequisite",
      "archive_card",
      "create_deck",
      "create_flashcard",
      "delete_card",
      "get_flashcard",
      "get_graph",
      "import_flashcard_hierarchy",
      "list_decks",
      "list_flashcards",
      "list_open_profiles",
      "remove_prerequisite",
      "select_profile",
      "update_card",
    ]);

    const profiles = parseToolText(
      await client!.callTool({ name: "list_open_profiles", arguments: {} }),
    );
    expect(profiles.activeProfileId).toBe("mcp-smoke");
    expect(profiles.profiles).toEqual([{ id: "mcp-smoke" }]);

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
        name: "create_flashcard",
        arguments: {
          deckId,
          front: "What is MCP?",
          back: "Model Context Protocol",
        },
      }),
    );
    const reviewUnitId = (createdCard.flashcard as { id: string }).id;

    const createdDependent = parseToolText(
      await client!.callTool({
        name: "create_flashcard",
        arguments: {
          deckId,
          front: "What depends on MCP?",
          back: "An MCP client workflow",
        },
      }),
    );
    const dependentCardId = (createdDependent.flashcard as { id: string }).id;

    await client!.callTool({
      name: "add_prerequisite",
      arguments: { prereqId: reviewUnitId, dependentId: dependentCardId },
    });
    const lockedDependent = parseToolText(
      await client!.callTool({
        name: "get_flashcard",
        arguments: { id: dependentCardId },
      }),
    );
    expect((lockedDependent.flashcard as { locked: boolean }).locked).toBe(true);

    await client!.callTool({
      name: "remove_prerequisite",
      arguments: { prereqId: reviewUnitId, dependentId: dependentCardId },
    });
    const unlockedDependent = parseToolText(
      await client!.callTool({
        name: "get_flashcard",
        arguments: { id: dependentCardId },
      }),
    );
    expect((unlockedDependent.flashcard as { locked: boolean }).locked).toBe(
      false,
    );

    const imported = parseToolText(
      await client!.callTool({
        name: "import_flashcard_hierarchy",
        arguments: {
          deckName: "Hierarchy Deck",
          flashcards: [
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
      imported.flashcards as Array<{ clientId: string; id: string }>
    ).find((c) => c.clientId === "base")!.id;
    const nextId = (
      imported.flashcards as Array<{ clientId: string; id: string }>
    ).find((c) => c.clientId === "next")!.id;

    // Cross-deck prerequisites are rejected: the prereq lives in the first deck
    // while `nextId` lives in the hierarchy deck.
    const crossDeck = await client!.callTool({
      name: "add_prerequisite",
      arguments: { prereqId: reviewUnitId, dependentId: nextId },
    });
    expect((crossDeck as { isError?: boolean }).isError).toBe(true);

    const listed = parseToolText(
      await client!.callTool({
        name: "list_flashcards",
        arguments: { deckId: hierarchyDeckId },
      }),
    );
    expect((listed.flashcards as unknown[]).length).toBeGreaterThanOrEqual(2);

    const fetched = parseToolText(
      await client!.callTool({
        name: "get_flashcard",
        arguments: { id: baseId },
      }),
    );
    expect((fetched.flashcard as { front: string }).front).toBe("Base");

    // get_graph is deck-scoped and requires a deck id.
    const missingDeck = await client!.callTool({
      name: "get_graph",
      arguments: {},
    });
    expect((missingDeck as { isError?: boolean }).isError).toBe(true);

    const graph = parseToolText(
      await client!.callTool({
        name: "get_graph",
        arguments: { deckId: hierarchyDeckId },
      }),
    );
    const edges = (graph.graph as { edges: unknown[] }).edges;
    expect(edges.length).toBeGreaterThanOrEqual(1);
    // Only the hierarchy deck's flashcards are returned.
    const graphNodes = (graph.graph as { nodes: { id: string }[] }).nodes;
    expect(graphNodes.map((n) => n.id).sort()).toEqual(
      [baseId, nextId].sort(),
    );

    const allDecks = parseToolText(
      await client!.callTool({ name: "list_decks", arguments: {} }),
    );
    expect((allDecks.decks as unknown[]).length).toBeGreaterThanOrEqual(2);
  });

  it("updates, archives, and deletes cards through MCP mutation tools", async () => {
    const createdDeck = parseToolText(
      await client!.callTool({
        name: "create_deck",
        arguments: { name: "Mutation Deck" },
      }),
    );
    const deckId = (createdDeck.deck as { id: string }).id;

    const createdCard = parseToolText(
      await client!.callTool({
        name: "create_flashcard",
        arguments: { deckId, front: "Forward", back: "Back" },
      }),
    );
    const cardId = (createdCard.flashcard as { id: string }).id;
    const [forwardBefore] = await reviewUnitsFor(cardId);
    await review.rateReviewUnit(
      await testServiceContext(),
      forwardBefore.id,
      Rating.Good,
    );
    const [reviewedForward] = await reviewUnitsFor(cardId);

    const updated = parseToolText(
      await client!.callTool({
        name: "update_card",
        arguments: {
          id: cardId,
          type: "basic_reversed",
          content: { front: "Forward edited", back: "Back edited" },
        },
      }),
    );
    expect((updated.flashcard as { type: string; front: string }).type).toBe(
      "basic_reversed",
    );
    expect((updated.flashcard as { type: string; front: string }).front).toBe(
      "Forward edited",
    );

    const afterUpdate = await reviewUnitsFor(cardId);
    expect(afterUpdate.map((unit) => unit.subKey).sort()).toEqual(["", "rev"]);
    const forwardAfter = afterUpdate.find((unit) => unit.subKey === "")!;
    expect(forwardAfter.id).toBe(forwardBefore.id);
    expect(forwardAfter.reps).toBe(reviewedForward.reps);
    expect(forwardAfter.state).toBe(reviewedForward.state);
    expect(await reviewLogsFor(forwardBefore.id)).toHaveLength(1);

    const dependent = parseToolText(
      await client!.callTool({
        name: "create_flashcard",
        arguments: { deckId, front: "Dependent", back: "Depends" },
      }),
    );
    const dependentId = (dependent.flashcard as { id: string }).id;
    await client!.callTool({
      name: "add_prerequisite",
      arguments: { prereqId: cardId, dependentId },
    });
    expect(
      (parseToolText(
        await client!.callTool({
          name: "get_flashcard",
          arguments: { id: dependentId },
        }),
      ).flashcard as { locked: boolean }).locked,
    ).toBe(true);

    const archived = parseToolText(
      await client!.callTool({
        name: "archive_card",
        arguments: { id: cardId, archived: true },
      }),
    );
    expect((archived.flashcard as { archived: boolean }).archived).toBe(true);
    expect((await reviewUnitsFor(cardId)).every((unit) => unit.archived)).toBe(
      true,
    );
    expect(
      (parseToolText(
        await client!.callTool({
          name: "get_flashcard",
          arguments: { id: dependentId },
        }),
      ).flashcard as { locked: boolean }).locked,
    ).toBe(false);

    const unarchived = parseToolText(
      await client!.callTool({
        name: "archive_card",
        arguments: { id: cardId, archived: false },
      }),
    );
    expect((unarchived.flashcard as { archived: boolean }).archived).toBe(false);
    expect(
      (parseToolText(
        await client!.callTool({
          name: "get_flashcard",
          arguments: { id: dependentId },
        }),
      ).flashcard as { locked: boolean }).locked,
    ).toBe(true);

    await client!.callTool({ name: "delete_card", arguments: { id: cardId } });
    expect(await reviewUnitsFor(cardId)).toHaveLength(0);
    expect(await reviewLogsFor(forwardBefore.id)).toHaveLength(0);
    expect(
      (parseToolText(
        await client!.callTool({
          name: "get_flashcard",
          arguments: { id: dependentId },
        }),
      ).flashcard as { locked: boolean }).locked,
    ).toBe(false);
  });

  it("supports streamable HTTP transport for the embedded app server", async () => {
    const sessions = new Map<
      string,
      WebStandardStreamableHTTPServerTransport
    >();

    const createHttpTransport = async () => {
      const httpTransport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: randomUUID,
        onsessioninitialized: (sessionId) => {
          sessions.set(sessionId, httpTransport);
        },
      });
      httpTransports.push(httpTransport);
      await createArminMcpServer(() => ({
        activeProfileId: "mcp-smoke",
        openProfiles: [{ id: "mcp-smoke" }],
      })).connect(httpTransport);
      return httpTransport;
    };

    httpServer = createServer((req, res) => {
      void (async () => {
        const body = req.method === "POST" ? await readBody(req) : undefined;
        const parsedBody = parseJsonBody(body);
        if (isInitializedNotification(parsedBody)) {
          res.writeHead(202);
          res.end();
          return;
        }

        const sessionId = req.headers["mcp-session-id"];
        const existingTransport =
          typeof sessionId === "string" ? sessions.get(sessionId) : undefined;
        if (!existingTransport && !isInitializeRequest(parsedBody)) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("Missing or invalid MCP session.");
          return;
        }

        const httpTransport =
          existingTransport ?? (await createHttpTransport());
        const address = httpServer!.address();
        if (!address || typeof address === "string") {
          throw new Error("Missing HTTP server address");
        }
        const response = await httpTransport.handleRequest(
          new Request(`http://127.0.0.1:${address.port}${req.url ?? "/"}`, {
            method: req.method,
            headers: req.headers as HeadersInit,
            body,
          }),
          { parsedBody },
        );
        await writeWebResponse(res, response);
      })().catch((error: unknown) => {
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "text/plain" });
        }
        res.end(error instanceof Error ? error.message : String(error));
      });
    });
    await new Promise<void>((resolve, reject) => {
      httpServer!.once("error", reject);
      httpServer!.listen(0, "127.0.0.1", () => {
        httpServer!.off("error", reject);
        resolve();
      });
    });

    const address = httpServer.address();
    if (!address || typeof address === "string") {
      throw new Error("Missing HTTP server address");
    }

    const httpClient = new Client({
      name: "armin-http-test",
      version: "1.0.0",
    });
    await httpClient.connect(
      new StreamableHTTPClientTransport(
        new URL(`http://127.0.0.1:${address.port}/mcp`),
      ),
    );
    try {
      const tools = await httpClient.listTools();
      expect(tools.tools.map((tool) => tool.name)).toContain("list_decks");
    } finally {
      await httpClient.close();
    }
  });
});
