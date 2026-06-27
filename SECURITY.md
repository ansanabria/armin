# Security Policy

Armin is a local-first desktop app: your study data lives on your own machine, and
the app ships a local MCP server that lets coding agents create and mutate that
data. Because of that surface, security reports are taken seriously even though the
project is early.

## Reporting a vulnerability

**Please do not report security issues through public GitHub issues.**

Report privately through either channel:

- **Preferred — GitHub Private Vulnerability Reporting.** Open the repository's
  [Security tab](https://github.com/ansanabria/armin/security) and use
  *"Report a vulnerability."* This keeps the report private and lets us coordinate
  a fix and advisory.
- **Email fallback.** If you would rather not use GitHub, email
  **ansanabria12@gmail.com** with details.

Please include, as far as you can:

- A description of the issue and its impact.
- Steps to reproduce, or a proof of concept.
- The Armin version and your operating system.
- Whether it involves data at rest, the MCP server, or the renderer/IPC boundary.

## What to expect

This is a solo, best-effort project. I'll acknowledge reports as soon as I
reasonably can, keep you updated on the fix, and credit you in the release notes
unless you prefer to stay anonymous. Please give a reasonable window to address the
issue before any public disclosure.

## Scope notes

Areas of particular interest:

- **MCP server.** Unauthorized access to the local MCP port, or an agent escaping
  the intended create/mutate scope.
- **Data at rest.** Profile databases and exported backups.
- **Renderer / IPC / CSP.** Content injection or privilege escalation across the
  Electron preload/IPC boundary.

Out of scope: unsigned Windows/macOS builds and the resulting SmartScreen/Gatekeeper
warnings are a known, documented limitation (see
[`apps/desktop/docs/adr/0014-launch-unsigned-defer-code-signing.md`](apps/desktop/docs/adr/0014-launch-unsigned-defer-code-signing.md)),
not a vulnerability report.
