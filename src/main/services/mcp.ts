import { app } from "electron";
import type { McpSetup } from "../../shared/mcp";
import { getEmbeddedMcpStatus } from "../mcp-http";

/** Setup info agents need to connect to Armin's embedded MCP server. */
export function getMcpSetup(profileId: string): McpSetup {
  void profileId;
  const status = getEmbeddedMcpStatus();
  return {
    url: status.url,
    running: status.running,
    error: status.error,
    isPackaged: app.isPackaged,
    repoPath: app.isPackaged ? null : app.getAppPath(),
  };
}

export function getMcpStatus() {
  return getEmbeddedMcpStatus();
}
