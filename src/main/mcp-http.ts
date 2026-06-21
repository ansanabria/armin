import { randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createArminMcpServer } from "../mcp/app";
import { DEFAULT_MCP_PORT } from "../shared/mcp";
import { getEffectiveMcpPort } from "./services/app-settings";
import { getActiveProfileIdForMcp, getOpenProfilesForMcp } from "./windows";

const MCP_HOST = "127.0.0.1";
const MCP_PORTS = [
  DEFAULT_MCP_PORT,
  47322, 47323, 47324, 47325, 47326, 47327, 47328, 47329, 47330,
];
const MCP_PATH = "/mcp";

let httpServer: Server | null = null;
let boundPort: number | null = null;
let lastStartError: string | null = null;
const transports = new Map<string, WebStandardStreamableHTTPServerTransport>();

function buildCandidatePorts(preferredPort: number): number[] {
  const seen = new Set<number>();
  const candidates: number[] = [];
  for (const port of [preferredPort, ...MCP_PORTS]) {
    if (!Number.isFinite(port)) continue;
    if (seen.has(port)) continue;
    seen.add(port);
    candidates.push(port);
  }
  return candidates;
}

function isAddrInUse(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "EADDRINUSE"
  );
}

async function listenOnPort(server: Server, port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, MCP_HOST);
  });
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
  const port = boundPort ?? MCP_PORTS[0];
  return `http://${MCP_HOST}:${port}${MCP_PATH}`;
}

export function getEmbeddedMcpStatus(): {
  running: boolean;
  url: string | null;
  port: number | null;
  error: string | null;
} {
  const running = httpServer != null && boundPort != null;
  return {
    running,
    url: running ? getEmbeddedMcpUrl() : null,
    port: boundPort,
    error: lastStartError,
  };
}

export async function startEmbeddedMcpServer() {
  if (httpServer && boundPort != null) return getEmbeddedMcpUrl();

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

  const candidates = buildCandidatePorts(getEffectiveMcpPort());
  let bound = false;

  for (const port of candidates) {
    try {
      await listenOnPort(httpServer, port);
      boundPort = port;
      lastStartError = null;
      bound = true;
      break;
    } catch (error) {
      if (isAddrInUse(error)) continue;
      httpServer.close();
      httpServer = null;
      boundPort = null;
      lastStartError =
        error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  if (!bound) {
    httpServer.close();
    httpServer = null;
    boundPort = null;
    const range = `${MCP_PORTS[0]}-${MCP_PORTS[MCP_PORTS.length - 1]}`;
    lastStartError = `All MCP ports are in use (${range}).`;
    throw new Error(lastStartError);
  }

  return getEmbeddedMcpUrl();
}

export function stopEmbeddedMcpServer() {
  httpServer?.close();
  httpServer = null;
  boundPort = null;
  for (const transport of transports.values()) {
    void transport.close();
  }
  transports.clear();
}
