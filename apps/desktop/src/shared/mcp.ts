export type McpSetup = {
  url: string | null;
  running: boolean;
  error: string | null;
  configuredPort: number;
  activePort: number | null;
  isPackaged: boolean;
  /** Armin source checkout; null when the desktop app is packaged. */
  repoPath: string | null;
};

export const DEFAULT_MCP_PORT = 47321;
export const MCP_PORT_MIN = 1024;
export const MCP_PORT_MAX = 65535;

export function isValidMcpPort(port: number): boolean {
  return (
    Number.isInteger(port) && port >= MCP_PORT_MIN && port <= MCP_PORT_MAX
  );
}

export function buildCursorMcpConfig(setup: McpSetup): string {
  if (!setup.url) {
    throw new Error("MCP server is not running.");
  }
  return JSON.stringify(
    {
      mcpServers: {
        armin: {
          url: setup.url,
        },
      },
    },
    null,
    2,
  );
}

export function buildClaudeCliCommand(setup: McpSetup): string {
  if (!setup.url) {
    throw new Error("MCP server is not running.");
  }
  return `claude mcp add --scope local --transport http armin ${setup.url}`;
}

export function buildCodexCliCommand(setup: McpSetup): string {
  if (!setup.url) {
    throw new Error("MCP server is not running.");
  }
  return `codex mcp add armin --url ${setup.url}`;
}

export function buildOpenCodeMcpConfig(setup: McpSetup): string {
  if (!setup.url) {
    throw new Error("MCP server is not running.");
  }
  return JSON.stringify(
    {
      $schema: "https://opencode.ai/config.json",
      mcp: {
        armin: {
          type: "remote",
          url: setup.url,
          enabled: true,
          timeout: 10000,
        },
      },
    },
    null,
    2,
  );
}
