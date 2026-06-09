import { spawnSync } from "node:child_process";
function githubToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;

  const result = spawnSync("gh", ["auth", "token"], {
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status === 0) return result.stdout.trim();

  const detail = result.stderr.trim() || "gh auth token failed";
  throw new Error(
    `GITHUB_TOKEN is not set and GitHub CLI could not provide one: ${detail}\n` +
      "Run `gh auth login`, or set GITHUB_TOKEN manually.",
  );
}

function findArtifacts(directory) {
  if (!fs.existsSync(directory)) return [];

  return fs
    .readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name))
    .filter((file) => !file.endsWith(".yml") && !file.endsWith(".yaml"))
    .sort();
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForArtifacts(directory) {
  const deadline = Date.now() + 180_000;

  while (Date.now() < deadline) {
    const artifacts = findArtifacts(directory);
    if (artifacts.length > 0) return artifacts;
    await sleep(1000);
  }

  return [];
}

const env = {
  ...process.env,
  GITHUB_TOKEN: githubToken(),
};

const result = spawnSync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["exec", "--", "electron-forge", "publish"],
  {
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
