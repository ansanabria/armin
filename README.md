# Armin

Armin is a local-first, spaced-repetition flashcard app for desktop. It helps you
learn and retain knowledge over time, and it's built around the idea that real
learning is **hierarchical** — you can't properly learn TypeScript until you have
the underlying JavaScript fundamentals.

## What it is

A desktop study tool (Electron) where you create decks and cards, connect cards by
their prerequisites, and review them on a schedule that adapts to how well you
actually remember each one. Reviews are powered by
[FSRS](https://github.com/open-spaced-repetition/ts-fsrs) (Free Spaced Repetition
Scheduler), the same modern algorithm used by tools like Anki's FSRS mode.

## Why it exists

Most flashcard apps treat every card as an independent island. In practice,
knowledge is a graph: some things are prerequisites for others. Armin makes that
structure explicit. A card stays **locked** until everything it depends on has been
learned, so you build foundations before tackling what sits on top of them — and
new material lands on knowledge you've already secured.

This is an open-source project built to solve a specific personal problem, not a
business. The goal is to share it and, over time, grow it with a community. It will
never be a SaaS.

## Core principles

- **Local-first.** Everything works offline; your data lives on your machine. No
  account, no server required.
- **Spaced repetition done right.** FSRS schedules each card based on your recall
  performance, maximizing retention while minimizing review load.
- **Hierarchical knowledge.** Cards form a prerequisite graph. You review the
  prerequisites first, then unlock and learn what builds on them. A visual canvas
  lets you see and edit the graph of connections between cards.
- **Simple UI & UX.** Creating decks, cards, and tags should be fast, and reviewing
  should be keyboard-driven and frictionless.
- **AI-assisted card creation.** Armin exposes a local MCP server, so you can use
  your own AI agent (Claude Code, Codex, OpenCode, etc.) to generate flashcards from
  a topic, your notes, or research — speeding up the slowest part of studying.
- **Open-source.** Fully open, MIT-licensed, and meant to be built on.

## Tech stack

- **Electron + Vite + React** — cross-platform desktop shell and UI.
- **SQLite** (via libSQL) with **Drizzle ORM** — local, type-safe persistence.
- **ts-fsrs** — the spaced-repetition scheduling engine.
- **TanStack Router + TanStack Query** — routing and data flow in the renderer.
- **React Flow** — the visual prerequisite-graph canvas.
- **MCP (Model Context Protocol)** — the local server AI agents connect to in order
  to create cards.

## Releases

Alpha builds are published from GitHub tags. See
[docs/release.md](docs/release.md) for the release checklist, artifact targets,
and current unsigned-build notes.

## MCP server

Armin includes a local stdio MCP server for coding agents. Agents can create
decks, create cards, connect prerequisite relationships, and import a whole
prerequisite graph in one tool call.

The main workflow tool is `import_card_hierarchy`. Give each proposed card a
temporary `clientId`, then reference those IDs in `prerequisites`. Armin creates
the real card IDs and prerequisite edges atomically.

Available tools:

- `list_decks`
- `create_deck`
- `create_card`
- `add_prerequisite`
- `import_card_hierarchy`
- `get_deck_graph`
- `list_cards`
- `get_card`

### Run locally

Install dependencies first:

```bash
npm install
```

The MCP server runs outside Electron, so it needs `ARMIN_DATA_DIR` to know where
to store the SQLite database:

```bash
ARMIN_DATA_DIR="$PWD/.armin-data" npm run mcp
```

MCP writes to one Armin profile. Set `ARMIN_PROFILE_ID` to choose it; when omitted,
the server uses a profile named `mcp`.

```bash
ARMIN_DATA_DIR="$PWD/.armin-data" ARMIN_PROFILE_ID="default" npm run mcp
```

Use the same `ARMIN_DATA_DIR` when you want the desktop app and MCP server to
share a development database. For a packaged app, point `ARMIN_DATA_DIR` at the
same app data directory you want Armin to use.

### Example agent request

After configuring the MCP server in your agent, ask it something like:

```text
Use the Armin MCP server to create a deck named "TypeScript basics" with cards
for JavaScript values, TypeScript types, interfaces, generics, and conditional
types. Build the prerequisite graph from foundations to advanced concepts.
```

### Codex

Codex reads MCP servers from `~/.codex/config.toml` or from a trusted project
config at `.codex/config.toml`.

```toml
[mcp_servers.armin]
command = "npm"
args = ["--prefix", "/absolute/path/to/armin", "run", "mcp", "--"]
startup_timeout_sec = 20
tool_timeout_sec = 60

[mcp_servers.armin.env]
ARMIN_DATA_DIR = "/absolute/path/to/armin/.armin-data"
ARMIN_PROFILE_ID = "default"
```

You can also add it from the CLI:

```bash
codex mcp add armin \
  --env ARMIN_DATA_DIR=/absolute/path/to/armin/.armin-data \
  --env ARMIN_PROFILE_ID=default \
  -- npm --prefix /absolute/path/to/armin run mcp --
```

In the Codex TUI, run `/mcp` to check that `armin` is connected.

### Claude Code

For project-scoped setup, add this to `.mcp.json` in the project where you want
Claude Code to use Armin:

```json
{
  "mcpServers": {
    "armin": {
      "type": "stdio",
      "command": "npm",
      "args": ["--prefix", "/absolute/path/to/armin", "run", "mcp", "--"],
      "env": {
        "ARMIN_DATA_DIR": "/absolute/path/to/armin/.armin-data",
        "ARMIN_PROFILE_ID": "default"
      }
    }
  }
}
```

Or add it with the Claude Code CLI:

```bash
claude mcp add --transport stdio --scope project \
  --env ARMIN_DATA_DIR=/absolute/path/to/armin/.armin-data \
  --env ARMIN_PROFILE_ID=default \
  armin -- npm --prefix /absolute/path/to/armin run mcp --
```

Run `claude mcp list` or use `/mcp` inside Claude Code to verify the server.

### Cursor

For project-specific setup, create `.cursor/mcp.json` in the project where
Cursor should use Armin:

```json
{
  "mcpServers": {
    "armin": {
      "type": "stdio",
      "command": "npm",
      "args": ["--prefix", "${workspaceFolder}", "run", "mcp", "--"],
      "env": {
        "ARMIN_DATA_DIR": "${workspaceFolder}/.armin-data",
        "ARMIN_PROFILE_ID": "default"
      }
    }
  }
}
```

If Armin is not the Cursor workspace, replace `${workspaceFolder}` with the
absolute path to this repository.

### OpenCode

Add Armin under `mcp` in `opencode.json` or `opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "armin": {
      "type": "local",
      "command": [
        "npm",
        "--prefix",
        "/absolute/path/to/armin",
        "run",
        "mcp",
        "--",
      ],
      "environment": {
        "ARMIN_DATA_DIR": "/absolute/path/to/armin/.armin-data",
        "ARMIN_PROFILE_ID": "default",
      },
      "enabled": true,
      "timeout": 10000,
    },
  },
}
```

Run `opencode mcp list` to verify the server.

## Status

Early development. The core loop — decks, cards, FSRS-scheduled reviews, local
persistence, and the first stdio MCP server are in place. The prerequisite-graph
canvas is the next major milestone.
