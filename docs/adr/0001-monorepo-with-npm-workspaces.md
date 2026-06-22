# Armin is a monorepo managed with npm workspaces

Armin is adding an optional, paid cloud sync service alongside the local-first
desktop app. The sync service is a separate deployable with its own lifecycle, but
it shares a thin protocol contract with the desktop client, so both live in one
repository. We restructured the repo from a single root-level Electron app into a
monorepo: deployables under `apps/` (`desktop`, `sync-server`), shared libraries
under `packages/` (`sync-contract`), and a root reserved for workspace wiring and
repo-wide lint/type/format tooling.

We chose **npm workspaces** over pnpm and over adding Turborepo/Nx. Staying on npm
keeps the delicate `better-sqlite3` per-runtime ABI rebuild (ADR `apps/desktop`
0012) working untouched, where pnpm's non-flat `node_modules` is a known hazard for
Electron native-module rebuilds. A task runner earns its config at ~10+ packages;
at three workspaces it is pure overhead. The native module stays declared in
`apps/desktop` alone — the sync server is opaque encrypted blob storage and never
depends on it — so workspace hoisting cannot introduce a second ABI copy.

Consequences: the entire desktop app moved from the repo root into `apps/desktop/`,
with all Forge/Vite/Drizzle/test path references updated. Documentation became
multi-context: a root `CONTEXT-MAP.md` indexes per-context `CONTEXT.md` and
`docs/adr/`; the study glossary and its 12 ADRs moved under `apps/desktop`;
system-wide decisions live in root `docs/adr/`. Root convenience scripts (`start`,
`test`, `lint`, `typecheck`, `package`) delegate to `apps/desktop`.
`apps/sync-server` and `packages/sync-contract` exist as empty placeholders; the
`apps/*` and `packages/*` globs absorb future workspaces automatically.
