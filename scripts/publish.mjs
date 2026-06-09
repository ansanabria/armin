import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const tagName = `v${packageJson.version}`;
const dryRun = process.argv.includes("--dry-run");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    env: options.env ?? process.env,
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = options.capture ? result.stderr.trim() : "";
    throw new Error(
      `${command} ${args.join(" ")} failed with exit code ${result.status}` +
        (detail ? `:\n${detail}` : ""),
    );
  }

  return result;
}

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

const env = {
  ...process.env,
  GITHUB_TOKEN: githubToken(),
};

run(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "make"], { env });

const releaseExists = spawnSync("gh", ["release", "view", tagName], {
  env,
  encoding: "utf8",
  shell: process.platform === "win32",
  stdio: ["ignore", "pipe", "pipe"],
});

if (releaseExists.status !== 0) {
  run(
    "gh",
    [
      "release",
      "create",
      tagName,
      "--prerelease",
      "--title",
      tagName,
      "--generate-notes",
    ],
    { env },
  );
}

const artifacts = findArtifacts(path.resolve("out/make"));

if (artifacts.length === 0) {
  throw new Error("No release artifacts were found in out/make.");
}

if (dryRun) {
  console.log(`Dry run: would upload ${artifacts.length} artifact(s) to ${tagName}:`);
  for (const artifact of artifacts) console.log(`- ${artifact}`);
  process.exit(0);
}

run("gh", ["release", "upload", tagName, ...artifacts, "--clobber"], { env });
