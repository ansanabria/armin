# Handoff — Armin: finish the UI work (UI-only)

## Focus for the next session
Finish the **renderer UI**, and *only* the UI. The user was explicit twice:

> "I specified I only wanted the UI, just finish the UI"

Concretely this means:
- **Do NOT wire the backend.** Keep every screen running on the preview/fixtures harness
  (`src/renderer/preview/preview-context.tsx` + `src/renderer/data/fixtures.ts`). Actions
  stay faked (toasts); data still comes from fixtures driven by the `usePreview()` scenario
  switch (`loading | empty | ready | error`).
- Do not replace `usePreview()` reads with `useQuery(...)`. That's a later, separate task and
  the user does not want it now.

## State of the work (what's already done)
A full design system and a polished, design-driven UI were built in the prior session. The
four primary screens + root layout appear **complete and consistent** with the design system:

- `src/renderer/routes/__root.tsx` — sticky nav shell (Decks / Settings), brand mark.
- `src/renderer/routes/decks.tsx` — deck grid, "due today" bar, create-deck dialog, all 4
  preview states (loading/empty/ready/error).
- `src/renderer/routes/deck.tsx` — card list with state badges + lock styling, add/edit card
  dialog, all preview states. Has a **"Graph" button that only fires a toast** ("the visual
  canvas is the next milestone") — see Gap below.
- `src/renderer/routes/review.tsx` — keyboard-driven review (space to flip, 1–4 to rate),
  rating grid with interval previews, "all caught up" + loading/error states.
- `src/renderer/routes/settings.tsx` — scheduling/appearance/MCP/data sections, MCP connect
  command with copy button.
- UI primitives under `src/renderer/components/ui/` (button, input, textarea, dialog, badge,
  progress, skeleton, empty-state, kbd, segmented, select, switch, toast).
- `src/renderer/App.tsx` wraps Query + Toast + **Preview** providers; router in
  `src/renderer/router.tsx` (hash history; routes: `/`, `/deck/$deckId`,
  `/deck/$deckId/review`, `/settings`).

## The main remaining UI gap
**The prerequisite-graph canvas is the one screen still missing.** It's the visual heart of
the product (cards form a prerequisite DAG; locked until prereqs reach FSRS Review). Today:
- `deck.tsx`'s "Graph" button is a placeholder toast.
- There is **no `/deck/$deckId/graph` route** in `router.tsx` and no graph component.
- No graph fixtures exist in `data/fixtures.ts` (only decks/cards/reviewQueue/settings).

To finish the UI, the likely work is:
1. Add a React Flow canvas component (the plan names `@xyflow/react`; **confirm it's installed**
   — `grep xyflow package.json`. If not installed and the user wants UI-only with no new deps,
   consider a lightweight hand-rolled SVG/DOM node-graph instead, or ask.).
2. Add graph fixtures (nodes = cards with FSRS state + lock status; edges = prereq→dependent),
   matching the `DeckGraph` shape described in the plan.
3. Add the `/deck/$deckId/graph` route + wire the deck-page "Graph" button to it (replace the
   toast with a `<Link>`).
4. Honor the design system: petrol for edges/nodes, state colors for node fill, locked styling,
   flat surfaces, visible focus rings. See DESIGN.md §2 (Petrol = graph canvas) and §5.

**Before building, confirm scope with the user**: is "finish the UI" = build the graph canvas,
or just polish/close gaps on the existing four screens? The graph is the obvious missing piece,
but it's a meaningfully large addition — worth a one-line confirmation.

## Other small UI things to verify/close
- Run `npx tsc --noEmit` and `npm run lint` — confirm the renderer is clean (prior session
  reported tsc clean / lint 0 errors, 8 style warnings, but that predates the latest files).
- `decks.tsx` "Start review" in the Due-Today bar hardcodes `deckId: "js"` — fine for preview,
  but note it.
- Check responsive behavior of the deck grid and review card at the 1200×800 window size.

## Guardrails / conventions
- **CSS tokens**: the screens use custom utility classes (`text-ink`, `bg-surface`, `bg-clay`,
  `bg-again`/`-hard`/`-good`/`-easy`, `bg-new`/`-learning`, `*-bg`, `shadow-lift`,
  `animate-rise`/`-flip-in`/`-fade-in`, etc.). These are defined in
  `src/renderer/index.css` (Tailwind v4 `@theme`). Reuse existing tokens; add new ones there,
  don't hardcode hex.
- Icons: lucide-react, 1.5px stroke, 16–20px (DESIGN.md §5).
- Keep the "study notebook" calm aesthetic; no SaaS-dashboard / gamified patterns (DESIGN.md §6).
- This is a keyboard-first app — every interactive element needs a visible focus-visible ring.

## Key references (do not duplicate — read these)
- Design system (colors, type, components, do/don'ts): `DESIGN.md` (repo root).
- Build plan + milestones + architecture: `/home/andy-spike/.claude/plans/this-is-an-electron-tender-pretzel.md`
  (M2 = "Hierarchy: prerequisites + canvas" — the graph UI lives here).
- Product context: `README.md`, `PRODUCT.md` (repo root).
- Preview harness contract: header comment in `src/renderer/preview/preview-context.tsx`.
- Fixtures shape: `src/renderer/data/fixtures.ts`.
- Renderer types (`Grade`, window API): `src/renderer/types/window.d.ts`.
- Project agent config / issue tracker / labels: `AGENTS.md` + `docs/agents/*`.

## Backend (context only — NOT in scope this session)
A complete main-process backend exists (libSQL + Drizzle, services, zod IPC, `window.armin`
preload bridge) and M1 was verified end-to-end in an earlier session. It is intentionally
untouched by the UI screens right now. Leave it alone unless the user changes scope.

## Suggested skills
- **`impeccable`** — primary skill for this work. It's the frontend design/build/polish skill
  and matches "finish the UI" (graph canvas design, visual hierarchy, design-system adherence,
  live UI iteration). Use it to build the graph canvas and to audit the existing screens.
- **`find-docs`** — if using `@xyflow/react` (React Flow), TanStack Router, or Tailwind v4
  APIs, fetch current docs first (per the user's global `ctx7` rule); don't rely on memory.
- **`verify`** / **`run`** — to launch the Electron app and visually confirm the UI (the
  Preview-states panel in the bottom-left drives loading/empty/ready/error without a backend).
- (Only if scope expands to wiring) **`diagnose`** for any IPC/query bugs — not expected here.
