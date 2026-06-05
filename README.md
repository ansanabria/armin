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
  lets you see and edit the tree of connections between cards.
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

## Status

Early development. The core loop — decks, cards, and FSRS-scheduled reviews with
local persistence — is in place. The prerequisite-graph canvas and the MCP server
are the next milestones.
