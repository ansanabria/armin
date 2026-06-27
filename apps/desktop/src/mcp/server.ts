import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { closeDb } from "../main/db";
import { resolveMcpSession } from "../shared/mcp-session";
import { createArminMcpServer } from "./app";

async function main() {
  const session = resolveMcpSession();
  process.env.ARMIN_DATA_DIR = session.dataDir;

  const server = createArminMcpServer(() => ({
    activeProfileId: session.activeProfileId,
    openProfiles: session.openProfiles,
  }));
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack : String(error);
  console.error(message);
  closeDb();
  process.exit(1);
});

process.on("SIGINT", () => {
  closeDb();
  process.exit(0);
});
