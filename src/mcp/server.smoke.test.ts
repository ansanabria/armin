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
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createArminMcpServer } from "./app";

let dataDir: string;
let transport: StdioClientTransport | null = null;
let client: Client | null = null;
let httpServer: Server | null = null;
let httpTransports: WebStandardStreamableHTTPServerTransport[] = [];

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
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("MCP stdio server", () => {
  it("exposes tools and supports the core agent workflow", async () => {
    const tools = await client!.listTools();
    const names = tools.tools.map((tool) => tool.name).sort();
    expect(names).toEqual([
      "add_prerequisite",
      "create_deck",
      "create_flashcard",
      "get_deck_graph",
      "get_flashcard",
      "import_flashcard_hierarchy",
      "list_decks",
      "list_flashcards",
      "list_open_profiles",
      "select_profile",
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

    await client!.callTool({
      name: "add_prerequisite",
      arguments: { prereqId: reviewUnitId, dependentId: nextId },
    });

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
