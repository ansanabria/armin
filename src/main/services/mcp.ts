import { app } from "electron";
import type { McpSetup } from "../../shared/mcp";
import { getEmbeddedMcpUrl } from "../mcp-http";

/** Setup info agents need to launch Armin's stdio MCP server. */
export function getMcpSetup(profileId: string): McpSetup {
  void profileId;
  return {
    url: getEmbeddedMcpUrl(),
    isPackaged: app.isPackaged,
    repoPath: app.isPackaged ? null : app.getAppPath(),
  };
}
