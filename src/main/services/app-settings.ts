import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { DEFAULT_MCP_PORT, isValidMcpPort } from "../../shared/mcp";

/**
 * App-global settings that live outside any profile database. Unlike the
 * per-profile `settings` table, these apply to the whole installation — e.g.
 * the embedded MCP server is a single shared process, so its enabled flag
 * belongs here rather than in one profile's data.
 */
export type AppSettings = {
  mcpEnabled: boolean;
  /** User-overridden MCP port; null means use {@link DEFAULT_MCP_PORT}. */
  mcpPort: number | null;
};

const STORE_VERSION = 1;

const DEFAULTS: AppSettings = {
  mcpEnabled: true,
  mcpPort: null,
};

function storePath() {
  return path.join(app.getPath("userData"), "app-settings.json");
}

export function getAppSettings(): AppSettings {
  const file = storePath();
  if (!fs.existsSync(file)) return { ...DEFAULTS };

  try {
    const parsed = JSON.parse(
      fs.readFileSync(file, "utf8"),
    ) as Partial<AppSettings>;
    return {
      mcpEnabled:
        typeof parsed.mcpEnabled === "boolean"
          ? parsed.mcpEnabled
          : DEFAULTS.mcpEnabled,
      mcpPort:
        typeof parsed.mcpPort === "number" && isValidMcpPort(parsed.mcpPort)
          ? parsed.mcpPort
          : null,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function writeAppSettings(settings: AppSettings) {
  const file = storePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify({ version: STORE_VERSION, ...settings }, null, 2),
    "utf8",
  );
}

export function setMcpEnabled(enabled: boolean): AppSettings {
  const next = { ...getAppSettings(), mcpEnabled: enabled };
  writeAppSettings(next);
  return next;
}

export function getEffectiveMcpPort(): number {
  return getAppSettings().mcpPort ?? DEFAULT_MCP_PORT;
}

export function setMcpPort(port: number): AppSettings {
  if (!isValidMcpPort(port)) {
    throw new Error(`Invalid MCP port: ${port}`);
  }
  const next = {
    ...getAppSettings(),
    mcpPort: port === DEFAULT_MCP_PORT ? null : port,
  };
  writeAppSettings(next);
  return next;
}
