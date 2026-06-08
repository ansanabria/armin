export type McpSetup = {
  dataDir: string;
  profileId: string;
  isPackaged: boolean;
  /** Armin source checkout; null when the desktop app is packaged. */
  repoPath: string | null;
};

const REPO_PLACEHOLDER = "/absolute/path/to/armin";

function repoPrefix(setup: McpSetup): string {
  return setup.repoPath ?? REPO_PLACEHOLDER;
}

export function buildCursorMcpConfig(setup: McpSetup): string {
  const repo = setup.repoPath ?? "${workspaceFolder}";
  return JSON.stringify(
    {
      mcpServers: {
        armin: {
          type: "stdio",
          command: "npm",
          args: ["--prefix", repo, "run", "mcp", "--"],
          env: {
            ARMIN_DATA_DIR: setup.dataDir,
            ARMIN_PROFILE_ID: setup.profileId,
          },
        },
      },
    },
    null,
    2,
  );
}

export function buildClaudeMcpConfig(setup: McpSetup): string {
  return JSON.stringify(
    {
      mcpServers: {
        armin: {
          type: "stdio",
          command: "npm",
          args: ["--prefix", repoPrefix(setup), "run", "mcp", "--"],
          env: {
            ARMIN_DATA_DIR: setup.dataDir,
            ARMIN_PROFILE_ID: setup.profileId,
          },
        },
      },
    },
    null,
    2,
  );
}

export function buildClaudeCliCommand(setup: McpSetup): string {
  return [
    "claude mcp add --transport stdio --scope project",
    `  --env ARMIN_DATA_DIR=${setup.dataDir}`,
    `  --env ARMIN_PROFILE_ID=${setup.profileId}`,
    `  armin -- npm --prefix ${repoPrefix(setup)} run mcp --`,
  ].join(" \\\n");
}

export function buildCodexCliCommand(setup: McpSetup): string {
  return [
    "codex mcp add armin",
    `  --env ARMIN_DATA_DIR=${setup.dataDir}`,
    `  --env ARMIN_PROFILE_ID=${setup.profileId}`,
    `  -- npm --prefix ${repoPrefix(setup)} run mcp --`,
  ].join(" \\\n");
}
