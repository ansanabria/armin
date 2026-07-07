import { access } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  AssistantProvider,
  AssistantProviderId,
  AssistantProviderStatus,
} from "../../shared/assistant";

const execFileAsync = promisify(execFile);

const PROVIDERS: Record<
  AssistantProviderId,
  Omit<AssistantProvider, "status">
> = {
  codex: {
    id: "codex",
    name: "Codex",
    description: "Use your local Codex installation and ChatGPT subscription.",
    installUrl: "https://github.com/openai/codex",
  },
  "claude-code": {
    id: "claude-code",
    name: "Claude Code",
    description: "Use your local Claude Code installation and Claude subscription.",
    installUrl: "https://docs.anthropic.com/en/docs/claude-code/setup",
  },
  opencode: {
    id: "opencode",
    name: "OpenCode",
    description: "Use your local OpenCode runtime and its configured provider.",
    installUrl: "https://opencode.ai/docs",
  },
};

const commands: Record<AssistantProviderId, string> = {
  codex: "codex",
  "claude-code": "claude",
  opencode: "opencode",
};

function candidateNames(command: string) {
  if (process.platform !== "win32") return [command];
  const extensions = (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM")
    .split(";")
    .filter(Boolean);
  return [command, ...extensions.map((ext) => `${command}${ext.toLowerCase()}`)];
}

async function findExecutable(command: string) {
  const pathValue = process.env.PATH ?? "";
  const dirs = pathValue.split(delimiter).filter(Boolean);

  for (const dir of dirs) {
    for (const name of candidateNames(command)) {
      const candidate = join(dir, name);
      try {
        await access(candidate);
        return candidate;
      } catch {
        // Try the next PATH candidate.
      }
    }
  }

  return null;
}

async function canRun(command: string, args: string[]) {
  try {
    await execFileAsync(command, args, { timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

async function codexStatus(command: string): Promise<AssistantProviderStatus> {
  if (await canRun(command, ["login", "status"])) {
    return { state: "ready" };
  }
  return {
    state: "installed_not_authenticated",
    connectLabel: "Connect Codex",
    setupUrl: PROVIDERS.codex.installUrl,
  };
}

async function claudeCodeStatus(
  command: string,
): Promise<AssistantProviderStatus> {
  if (await canRun(command, ["auth", "status"])) {
    return { state: "ready" };
  }
  return {
    state: "installed_not_authenticated",
    connectLabel: "Connect Claude Code",
    setupUrl: PROVIDERS["claude-code"].installUrl,
  };
}

async function openCodeStatus(command: string): Promise<AssistantProviderStatus> {
  if (!(await canRun(command, ["--version"]))) {
    return {
      state: "error",
      message: "OpenCode is installed, but Armin could not run it.",
    };
  }

  if (await canRun(command, ["models"])) {
    return { state: "ready" };
  }

  return {
    state: "installed_not_configured",
    configureUrl: PROVIDERS.opencode.installUrl,
  };
}

async function providerStatus(
  providerId: AssistantProviderId,
): Promise<AssistantProviderStatus> {
  const command = await findExecutable(commands[providerId]);
  if (!command) {
    return {
      state: "not_installed",
      installUrl: PROVIDERS[providerId].installUrl,
    };
  }

  if (providerId === "codex") return codexStatus(command);
  if (providerId === "claude-code") return claudeCodeStatus(command);
  return openCodeStatus(command);
}

export async function listAssistantProviders(): Promise<AssistantProvider[]> {
  return Promise.all(
    (Object.keys(PROVIDERS) as AssistantProviderId[]).map(async (id) => ({
      ...PROVIDERS[id],
      status: await providerStatus(id),
    })),
  );
}

export function getAssistantProviderUrl(providerId: string) {
  const provider = PROVIDERS[providerId as AssistantProviderId];
  if (!provider) throw new Error("Unknown assistant provider.");
  return provider.installUrl;
}
