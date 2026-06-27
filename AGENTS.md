# AGENTS.md

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues (`ansanabria/armin`) via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Multi-context monorepo. `CONTEXT-MAP.md` at the repo root indexes each context's
own `CONTEXT.md` and `docs/adr/` (e.g. the study domain under `apps/desktop/`).
System-wide decisions live in the root `docs/adr/`. See `docs/agents/domain.md`.

## Notes

- The project context is described in @README.md . Always read the file when starting a new session.
- The repository is a monorepo: the desktop app lives in `apps/desktop/`, with placeholders for `apps/sync-server/` and `packages/sync-contract/`. Keep project-specific scripts in each workspace package; from the repo root, run desktop commands with `--workspace apps/desktop`.
- Testing philosophy and validation tiers are described in @apps/desktop/docs/testing.md . Read it before adding or changing tests.
- Migration workflow is described in @apps/desktop/docs/migrations.md . Read it before changing @apps/desktop/src/main/db/schema.ts or files under @apps/desktop/drizzle/ .
- Migration names must be descriptive. Pass a snake_case `--name` to Drizzle instead of accepting generated fantasy names.
- Shadcn uses Base UI instead of Radix UI. Use only Base UI, unless the user explictly asks to use the Radix UI API.

## TypeScript styling notes

- Don't use return types unless they are needed for a shared library.
