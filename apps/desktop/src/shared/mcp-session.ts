import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type McpSession = {
  dataDir: string;
  activeProfileId: string | null;
  openProfiles: McpSessionProfile[];
  pid: number;
  updatedAt: string;
};

export type McpSessionProfile = {
  id: string;
  name?: string;
};

export type ResolvedMcpSession = {
  dataDir: string;
  activeProfileId: string | null;
  openProfiles: McpSessionProfile[];
};

const APP_USER_DATA_DIR_NAME = "Armin";
const SESSION_FILE_NAME = "mcp-session.json";

function userSuffix() {
  return typeof process.getuid === "function" ? `-${process.getuid()}` : "";
}

function globalSessionPath() {
  return path.join(os.tmpdir(), `armin-mcp-session${userSuffix()}.json`);
}

export function defaultArminDataDir() {
  if (process.env.ARMIN_DATA_DIR) return process.env.ARMIN_DATA_DIR;

  if (process.platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      APP_USER_DATA_DIR_NAME,
    );
  }

  if (process.platform === "win32") {
    return path.join(
      process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"),
      APP_USER_DATA_DIR_NAME,
    );
  }

  return path.join(
    process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"),
    APP_USER_DATA_DIR_NAME,
  );
}

function dataDirSessionPath(dataDir: string) {
  return path.join(dataDir, SESSION_FILE_NAME);
}

function readSession(file: string): McpSession | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as McpSession;
    if (!parsed.dataDir || !parsed.pid) return null;
    if (Array.isArray(parsed.openProfiles)) return parsed;

    const legacy = parsed as unknown as McpSession & { profileId?: string };
    if (!legacy.profileId) return null;
    return {
      ...parsed,
      activeProfileId: legacy.profileId,
      openProfiles: [{ id: legacy.profileId }],
    };
  } catch {
    return null;
  }
}

function isProcessAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function writeMcpSession(
  dataDir: string,
  openProfiles: McpSessionProfile[],
  activeProfileId: string | null,
) {
  const session: McpSession = {
    dataDir,
    activeProfileId,
    openProfiles,
    pid: process.pid,
    updatedAt: new Date().toISOString(),
  };
  const serialized = JSON.stringify(session, null, 2);
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(dataDirSessionPath(dataDir), serialized, "utf8");
  fs.writeFileSync(globalSessionPath(), serialized, "utf8");
}

export function clearMcpSession(dataDir: string) {
  for (const file of [dataDirSessionPath(dataDir), globalSessionPath()]) {
    try {
      fs.rmSync(file, { force: true });
    } catch {
      // Best-effort cleanup only; stale sessions are ignored by PID checks.
    }
  }
}

function resolvedFromSession(session: McpSession): ResolvedMcpSession {
  return {
    dataDir: session.dataDir,
    activeProfileId: session.activeProfileId,
    openProfiles: session.openProfiles,
  };
}

export function resolveMcpSession(): ResolvedMcpSession {
  if (process.env.ARMIN_DATA_DIR && process.env.ARMIN_PROFILE_ID) {
    return {
      dataDir: process.env.ARMIN_DATA_DIR,
      activeProfileId: process.env.ARMIN_PROFILE_ID,
      openProfiles: [{ id: process.env.ARMIN_PROFILE_ID }],
    };
  }

  const globalSession = readSession(globalSessionPath());
  if (globalSession && isProcessAlive(globalSession.pid)) {
    return resolvedFromSession(globalSession);
  }

  const dataDir = defaultArminDataDir();
  const dataDirSession = readSession(dataDirSessionPath(dataDir));
  if (dataDirSession) {
    return resolvedFromSession({ ...dataDirSession, dataDir });
  }

  throw new Error(
    "No active Armin profile found. Open Armin and select a profile before using the MCP server.",
  );
}
