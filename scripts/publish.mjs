import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { api } = require("@electron-forge/core");
const { getMakeOptions } = require("@electron-forge/cli/dist/electron-forge-make.js");

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

process.env.GITHUB_TOKEN = env.GITHUB_TOKEN;

const args = process.argv.slice(2);
const targetIndex = args.indexOf("--target");
const targetValue = targetIndex >= 0 ? args[targetIndex + 1] : undefined;

const keepAlive = setInterval(() => {}, 1000);

try {
  await api.publish({
    dir: process.cwd(),
    interactive: true,
    dryRun: args.includes("--dry-run"),
    dryRunResume: args.includes("--from-dry-run"),
    publishTargets: targetValue ? targetValue.split(",") : undefined,
    makeOptions: await getMakeOptions(),
  });
} finally {
  clearInterval(keepAlive);
}
