# Product

## Register

product

## Users

Self-directed learners studying technical or layered subjects (programming,
languages, sciences) on their own desktop. They're often at a computer, in a
focused session, building real expertise over weeks and months rather than
cramming. Many are technically literate — comfortable with keyboard shortcuts,
local-first tools, and connecting their own AI agent (Claude Code, Codex,
OpenCode) to generate cards.

The job to be done: build durable, _hierarchical_ knowledge. Create decks and
cards, wire up prerequisite relationships, and run short spaced-repetition review
sessions that adapt to actual recall. The recurring primary task on most screens
is reviewing due cards quickly and judging recall honestly; the secondary task is
authoring and structuring cards into a prerequisite graph.

## Product Purpose

Armin is a local-first, FSRS-scheduled flashcard app for desktop that treats
knowledge as a graph instead of a flat pile. Cards declare prerequisites, and a
card stays locked until its foundations are learned — so new material always lands
on knowledge already secured, and a visual canvas makes the dependency tree
editable.

It exists because most flashcard apps treat every card as an independent island,
ignoring that real learning is layered. It's an open-source, MIT-licensed personal
project meant to grow with a community — explicitly never a SaaS. Success looks
like: a learner sits down, the right cards are due, review is fast and almost
entirely keyboard-driven, and over time they can see and trust the structure of
what they know.

## Brand Personality

Warm and encouraging, but grown-up — a calm study companion, not a cheerleader.
Three words: **warm, focused, trustworthy**. The tone is steady and
low-pressure: it celebrates progress quietly and never nags. It carries the DNA
of calm modern study tools (Mochi) and local-first knowledge tools (Obsidian) —
content-forward, slightly technical, respectful of a learner's attention.
Warmth comes from color temperature, copy, and gentle feedback, not from mascots
or gamification.

## Anti-references

- **Generic SaaS dashboard.** No cards-everywhere grids, blue gradients, hero
  metrics, or the default AI-app look. This is a study room, not an analytics
  product.
- **Cluttered like Anki.** No dense option panels, dated chrome, or overwhelming
  configuration surfaced up front. Power lives behind a calm surface.
- **Flashy marketing site.** No decorative animation, gradient-as-decoration, or
  attention-grabbing effects that compete with the content being learned.
- **Gamified / childish.** Warm is not cartoonish — no confetti storms, mascots,
  or loud badges. Encouragement stays adult and understated.

## Design Principles

1. **Content is the interface.** The card being learned is the most important
   thing on screen; chrome recedes so the material can be read and recalled.
2. **Quiet by default, power on demand.** Surface the calm path first; depth
   (prerequisite editing, scheduling internals, AI authoring) is reachable but
   never forced into view.
3. **Keyboard-first, friction-last.** Review and authoring should be fully
   operable from the keyboard; every common action has an obvious shortcut and a
   fast path.
4. **Show the structure.** Make hierarchy and prerequisite relationships
   legible and trustworthy — locked/unlocked, due/learned, what-builds-on-what
   should be visible and honest, not hidden behind a black box.
5. **Encourage without nagging.** Progress feedback is warm and quiet. Celebrate
   momentum; never guilt-trip a missed day.

## Accessibility & Inclusion

Target **WCAG 2.1 AA**: body text ≥4.5:1 contrast, large text ≥3:1, including
placeholder and muted text. Full keyboard navigation is a hard requirement given
the keyboard-first review loop, with visible focus states throughout. Honor
`prefers-reduced-motion` on every animation (crossfade or instant alternative).
Don't encode meaning in color alone — pair due/new/locked states with text or
icon cues so they survive color-blindness.
