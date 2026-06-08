import { app } from "electron";
import type { McpSetup } from "../../shared/mcp";

/** Paths and profile info agents need to share this Armin instance's data. */
export function getMcpSetup(profileId: string): McpSetup {
  const dataDir = process.env.ARMIN_DATA_DIR ?? app.getPath("userData");
  return {
    dataDir,
    profileId,
    isPackaged: app.isPackaged,
    repoPath: app.isPackaged ? null : app.getAppPath(),
  };
}
