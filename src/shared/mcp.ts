export type McpSetup = {
  url: string | null;
  running: boolean;
  error: string | null;
  isPackaged: boolean;
  /** Armin source checkout; null when the desktop app is packaged. */
  repoPath: string | null;
};

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
