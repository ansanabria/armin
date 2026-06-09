import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function githubToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;

  const result = spawnSync("gh", ["auth", "token"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status === 0) return result.stdout.trim();

  const detail = result.stderr.trim() || "gh auth token failed";
  throw new Error(
    `GITHUB_TOKEN is not set and GitHub CLI could not provide one: ${detail}\n` +
      "Run `gh auth login`, or set GITHUB_TOKEN manually.",
  );
}

const env = {
  ...process.env,
  GITHUB_TOKEN: githubToken(),
};

const forgeCli = fileURLToPath(
  new URL("../node_modules/@electron-forge/cli/dist/electron-forge.js", import.meta.url),
);

const result = spawnSync(process.execPath, [forgeCli, "publish"], {
  env,
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
