# AGENTS.md

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues (`ansanabria/armin`) via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout (`CONTEXT.md` + `docs/adr/` at the repo root). See `docs/agents/domain.md`.

## Notes

- The project context is described in @README.md . Always read the file when starting a new session.
- Shadcn uses Base UI instead of Radix UI. Use only Base UI, unless the user explictly asks to use the Radix UI API.
