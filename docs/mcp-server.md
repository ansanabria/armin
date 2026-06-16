# MCP server

Armin hosts a local MCP server while the desktop app is open. Coding agents can
connect to it over HTTP, then create decks, create cards, connect prerequisite
relationships, and import a whole prerequisite graph in one tool call.

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
- `list_open_profiles`
- `select_profile`

## Embedded server

Open Armin and select the profile you want the agent to write to. Armin starts
the MCP server automatically at:

```text
http://127.0.0.1:47321/mcp
```

If multiple profiles are open, the MCP server exposes `list_open_profiles` and
`select_profile`; the agent should ask you which profile to use before it creates
or reads cards.

## Development stdio server

The packaged app does not need this. It exists for tests and development.

Install dependencies first:

```bash
npm install
```

Open Armin and select the profile you want the development stdio server to write

```bash
npm run mcp
```

`ARMIN_DATA_DIR` and `ARMIN_PROFILE_ID` are still supported as advanced overrides
for tests or unusual setups, but normal agent configuration should not need them.

For example:

```bash
ARMIN_DATA_DIR="$PWD/.armin-data" ARMIN_PROFILE_ID="default" npm run mcp
```

## Example agent request

After configuring the MCP server in your agent, ask it something like:

```text
Use the Armin MCP server to create a deck named "TypeScript basics" with cards
for JavaScript values, TypeScript types, interfaces, generics, and conditional
types. Build the prerequisite graph from foundations to advanced concepts.
```

## Agent setup

Use the in-app MCP settings panel when possible. It shows the local MCP URL and
copies the right config for each agent.

The simplest setup for each supported coding agent is:

- Cursor: add a `.cursor/mcp.json` file.
- Claude Code: run `claude mcp add`.
- Codex: run `codex mcp add`.
- OpenCode: add `mcp.armin` to `opencode.json` or `opencode.jsonc`.

Before using any agent, open Armin and select the profile the agent should write
to.

## Cursor

Create `.cursor/mcp.json` in the project where Cursor should use Armin:

```json
{
  "mcpServers": {
    "armin": {
      "url": "http://127.0.0.1:47321/mcp"
    }
  }
}
```

## Claude Code

Run this in the project where Claude Code should use Armin:

```bash
claude mcp add --scope local --transport http armin http://127.0.0.1:47321/mcp
```

`--scope local` keeps the setup private to you and active only in the current
project. Use `--scope user` if you want Armin available in every Claude Code
project, or `--scope project` if you want Claude Code to write a shared
`.mcp.json` file.

Run `claude mcp list` or use `/mcp` inside Claude Code to verify the server.

## Codex

Run this once:

```bash
codex mcp add armin --url http://127.0.0.1:47321/mcp
```

In the Codex TUI, run `/mcp` to check that `armin` is connected.

## OpenCode

Add Armin under `mcp` in `opencode.json` or `opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "armin": {
      "type": "remote",
      "url": "http://127.0.0.1:47321/mcp",
      "enabled": true,
      "timeout": 10000,
    },
  },
}
```

Run `opencode mcp list` to verify the server.
