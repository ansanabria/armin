# Armin

Armin is a local-first, spaced-repetition flashcard app for desktop. It's built around the idea that learning is **hierarchical**. You should master the prerequisites of a topic you are trying to learn in order to understand it fully.

For more on the philosophy of what inspired this type of thinking, read this Justin Skycak's article on [learning prerequisites](https://www.justinmath.com/the-importance-of-learning-your-prerequisites/).

## What it is

A desktop study app where you create decks and cards (like Anki), connect cards by
their prerequisites, and review them on a schedule that adapts to how well you
actually remember each one. Reviews are powered by
[FSRS](https://github.com/open-spaced-repetition/ts-fsrs) (Free Spaced Repetition
Scheduler), the same algorithm used Anki's FSRS mode.

## Why it exists

Most flashcard apps treat every card as an independent island. In practice,
knowledge is a graph: some things are prerequisites for others. Armin makes that
structure explicit. A card stays **locked** until everything it depends on has been
learned, so you build foundations before tackling what sits on top of them — and
new material lands on knowledge you've already secured.

## Core principles

- **Local-first.** Everything works offline; your data lives on your machine. No account, no server required.
- **Spaced repetition done right.** FSRS schedules each card based on your recall performance.
- **Hierarchical knowledge.** Cards form a prerequisite graph. You review the
  prerequisites first, then unlock and learn what builds on them. A visual canvas
  lets you see and edit the graph of connections between cards.
- **Simple UI & UX.** Creating decks, cards, and tags should be fast, and reviewing
  should be keyboard-driven and frictionless.
- **AI-assisted card creation.** Armin exposes a local MCP server, so you can use
  your own AI agent (Claude Code, Codex, OpenCode, etc.) to generate flashcards from
  a topic, your notes, or research.
- **Open-source.** Fully open, MIT-licensed, and meant to be built on.

## Installation

Alpha builds are on the [GitHub Releases](https://github.com/ansanabria/armin/releases)
page. Artifacts are unsigned, so your OS may warn on first launch.

### Linux

Download the `Armin-*-x64.AppImage`, make it executable, and run it:

```bash
chmod +x Armin-*-x64.AppImage
./Armin-*-x64.AppImage
```

Optional: import the AppImage with [Gear Lever](https://github.com/mijorus/gearlever) for a
desktop entry.

### Windows

Download `Armin-*-Setup.exe` and run the installer. SmartScreen may block it because
the build is not signed.

### macOS

Download `Armin-darwin-arm64-*.zip` (Apple Silicon), extract it, and move `Armin.app`
into Applications. If Gatekeeper blocks the app, right-click it and choose **Open**.

## Releases

Alpha builds are published from GitHub tags. See
[docs/release.md](docs/release.md) for the release checklist, artifact targets,
and current unsigned-build notes.

## MCP server

Armin includes a local stdio MCP server so coding agents can create decks, cards,
and prerequisite graphs. See [docs/mcp-server.md](docs/mcp-server.md) for setup,
available tools, and configuration for Codex, Claude Code, Cursor, and OpenCode.

## Card-writing skill

The MCP server lets agents create cards, but it doesn't tell them _how_ to structure
the content — how to chunk a topic, what belongs in a single card, or how cards
should depend on each other. The `writing-study-cards` skill provides those
guidelines, distilled from Andy Matuschak's
[How to write good prompts](https://andymatuschak.org/prompts/). Install it so your
agent applies them automatically whenever it generates cards.

The skill lives in [`.agents/skills/writing-study-cards`](.agents/skills/writing-study-cards)
and installs with the [`skills` CLI](https://www.skills.sh/docs):

```bash
# Install into the current project (auto-detects your agent)
npx skills add ansanabria/armin --skill writing-study-cards

# Or install globally so it's available across all projects
npx skills add ansanabria/armin --skill writing-study-cards --global
```

You can target a specific agent (for example Cursor, Claude Code, or Codex) with
`-a`, and preview what's available without installing using `--list`:

```bash
npx skills add ansanabria/armin --list
npx skills add ansanabria/armin --skill writing-study-cards -a cursor
```

The `skills` CLI discovers skills under `.agents/skills/`, so it picks up
`writing-study-cards` directly from this repository.

## Development notes

Early development. Expect lots of bugs and strange behavior. I built this for myself in a Linux machine and it is supposed to work for macOS and Windows, but I haven't tested those builds myself, so be aware.

## Contributions

I'm not accepting contributions at the moment. If you try the app and find issues, file them in the Issues tab.
