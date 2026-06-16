import { randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createArminMcpServer } from "../mcp/app";
import { getActiveProfileIdForMcp, getOpenProfilesForMcp } from "./windows";

const MCP_HOST = "127.0.0.1";
const MCP_PORT = 47321;
const MCP_PATH = "/mcp";

let httpServer: Server | null = null;
const transports = new Map<string, WebStandardStreamableHTTPServerTransport>();

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

async function createTransport() {
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: randomUUID,
    onsessioninitialized: (sessionId) => {
      transports.set(sessionId, transport);
    },
  });
  transport.onclose = () => {
    if (transport.sessionId) transports.delete(transport.sessionId);
  };
  await createArminMcpServer(() => ({
    activeProfileId: getActiveProfileIdForMcp(),
    openProfiles: getOpenProfilesForMcp(),
  })).connect(transport);
  return transport;
}

export function getEmbeddedMcpUrl() {
  return `http://${MCP_HOST}:${MCP_PORT}${MCP_PATH}`;
}

export async function startEmbeddedMcpServer() {
  if (httpServer) return getEmbeddedMcpUrl();

  httpServer = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", getEmbeddedMcpUrl());
    res.setHeader("Access-Control-Allow-Origin", "http://localhost");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Mcp-Session-Id, Mcp-Protocol-Version",
    );

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (url.pathname !== MCP_PATH) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }

    try {
      const body = req.method === "POST" ? await readBody(req) : undefined;
      const parsedBody = parseJsonBody(body);
      if (isInitializedNotification(parsedBody)) {
        res.writeHead(202);
        res.end();
        return;
      }

      const sessionId = req.headers["mcp-session-id"];
      const existingTransport =
        typeof sessionId === "string" ? transports.get(sessionId) : undefined;
      if (!existingTransport && !isInitializeRequest(parsedBody)) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("Missing or invalid MCP session.");
        return;
      }

      const transport = existingTransport ?? (await createTransport());
      const response = await transport.handleRequest(
        new Request(getEmbeddedMcpUrl(), {
          method: req.method,
          headers: req.headers as HeadersInit,
          body,
        }),
        { parsedBody },
      );
      await writeWebResponse(res, response);
    } catch (error) {
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "text/plain" });
      }
      res.end(error instanceof Error ? error.message : String(error));
    }
  });

  await new Promise<void>((resolve, reject) => {
    const server = httpServer;
    if (!server) {
      reject(new Error("Embedded MCP server was not created."));
      return;
    }
    server.once("error", reject);
    server.listen(MCP_PORT, MCP_HOST, () => {
      server.off("error", reject);
      resolve();
    });
  });

  return getEmbeddedMcpUrl();
}

export function stopEmbeddedMcpServer() {
  httpServer?.close();
  httpServer = null;
  for (const transport of transports.values()) {
    void transport.close();
  }
  transports.clear();
}
