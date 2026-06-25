# Contributing to Armin

Thanks for trying Armin. The project is early and developed by one person, so the
contribution model is intentionally narrow right now.

## What's welcome

**Bug reports and feature requests — yes, please.** They are the most valuable
thing you can send at this stage. Use the [Issues tab][issues]; the templates will
guide you. New issues are labelled `needs-triage` and reviewed from there.

When filing a bug, include:

- Your OS and how you installed Armin (AppImage, Windows installer, macOS ZIP).
- The Armin version (see the app, or the release you downloaded).
- What you did, what you expected, and what actually happened.
- Whether your data persisted across a restart, if the bug touches study state.

## What's not open yet

**Code pull requests are not being accepted at the moment.** The domain model and
internal contracts are still moving quickly, and unsolicited PRs are likely to
collide with in-flight work. This will change as the project stabilizes; until
then, please open an issue to discuss an idea rather than sending a PR.

If you've found a fix and want to help, describe it in an issue — that's the
fastest way for it to land.

## Reporting a security issue

Do **not** open a public issue for security problems. See [SECURITY.md](SECURITY.md)
for the private reporting process.

## Project layout

Armin is a monorepo. The desktop app lives in `apps/desktop/`. The repository's
conventions, domain language, and architectural decisions are documented in:

- [`README.md`](README.md) — what Armin is and how to install it.
- [`CONTEXT-MAP.md`](CONTEXT-MAP.md) — the contexts and where their language lives.
- [`apps/desktop/docs/`](apps/desktop/docs/) — testing, migrations, release, and MCP docs.
- [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md) and
  [`docs/agents/triage-labels.md`](docs/agents/triage-labels.md) — how issues are
  tracked and triaged.

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By
participating, you agree to uphold it.

[issues]: https://github.com/ansanabria/armin/issues
