# Testing Philosophy

Armin keeps a small test suite. Tests protect durable core service contracts, not
every bug fix, branch, or UI helper. When a change needs confidence, prefer
running the app, targeted manual verification, typecheck, lint, or the existing
service/E2E tests before adding another test file.

Do not add a test just because a bug was fixed. Add or change a test only when
the behavior is a stable service invariant that should still be true after the
implementation is rewritten.

## Center of Gravity

Service tests against a real temporary SQLite Profile database are the unit test
boundary. Vitest is configured to run only `src/main/services/**/*.test.ts`.
These tests are worth keeping because the highest-risk bugs are persisted-state
bugs: a Locked flashcard entering review, a Secured prerequisite failing to
unlock dependents, a Frontier cap being applied per Deck, or delete/archive
leaving the Prerequisite graph inconsistent.

Prefer service tests for:

- Flashcard creation, update, archive, and delete behavior
- Review unit generation, scheduling, and review logs
- Secured and Locked flashcard transitions
- Prerequisite graph edges, cycles, propagation, and layout persistence
- Frontier selection
- Profile lifecycle and isolation
- import, export, and restore behavior

Avoid unit tests for:

- renderer components and local UI helpers
- Electron user-data path wiring
- migration bookkeeping and one-off backfills
- bug regressions that do not describe a durable service contract

MCP tests are the exception outside `src/main/services`: keep them in the
separate `test:mcp` lane because the local agent interface is a first-class app
surface.

## Database Setup

Tests should prefer public service operations for behavior setup. Use direct
database mutation only through named test helpers for states that are expensive,
nondeterministic, or beside the point.

Good defaults:

- create Profiles, Decks, Flashcards, prerequisites, archives, deletes, and
  reviews through service operations
- use direct database writes for hard-to-reach setup such as fixed FSRS state,
  forced due dates, or old persisted data before a migration
- promote repeated direct writes into helpers in `src/main/test/db.ts`
- name helpers by domain meaning, e.g. `securePrereq`, `makeDue`, or
  `makeFutureDue`

Avoid scattering raw Drizzle writes through tests when the same state can be
reached through a service operation.

## Renderer Tests

Do not add renderer unit tests by default. Renderer behavior should be covered by
manual verification or by the sparse E2E journeys when it is truly a critical
user path. If renderer logic becomes complex enough to deserve unit coverage,
first consider moving the durable rule into a main service or shared domain
module; otherwise discuss the exception before adding the test.

## E2E Tests

E2E tests provide wiring and journey confidence. Keep them sparse and focused on
flows that prove the packaged Electron app can move real data through preload,
IPC, services, and the renderer.

Use E2E tests to prove critical paths work across Electron, preload, IPC, and
renderer:

- create and open a Profile
- create a Deck
- create a Flashcard
- complete a review session
- edit the Prerequisite graph through the canvas
- archive or delete with visible consequence confirmation, if it becomes a
  release-critical flow
- import, export, or restore, if it becomes a release-critical flow

Do not add E2E tests for performance investigations, individual bug fixes, or
domain edge cases. Domain contracts belong in service tests; everything else
should be manually verified unless it is part of the app's core release smoke
journey.

## Coverage

Armin does not use numeric coverage targets as the definition of "tested".
Coverage means the core service invariants are represented at least once in a
clear, durable test. More tests are not automatically better.

Before adding a test, ask:

- Is this a core service contract rather than a UI detail or implementation
  branch?
- Would this behavior still matter if the internals were rewritten?
- Does an existing service test already cover the invariant?
- Is this more useful than a manual check recorded in the PR or issue?

If the answer is not clearly yes for the first two questions, do not add the
test.

## Naming

Test names should describe domain behavior using `CONTEXT.md` vocabulary. Assert
observable behavior, not implementation calls.

Prefer:

- `locks dependent flashcards until every prerequisite review unit is secured`
- `archive makes a prerequisite inert without deleting review history`
- `global queue applies the Frontier cap across Decks`
- `delete removes review history and recomputes dependent lock state`

Avoid:

- `calls refreshDependentSubgraph`
- `updates locked column`
- `returns 3 rows`
- `mutation succeeds`

Keep scenario setup explicit enough that the test tells the story. Extract
helpers when they name a reusable domain state.

## Mocks

Do not mock domain services by default. Prefer real SQLite Profile state and real
service calls.

Use real adapters for:

- SQLite database
- service modules
- Prerequisite graph transitions
- review scheduling state when deterministic enough
- import/export over temp files or in-memory bytes

Use mocks or stubs for:

- fixed time
- OS dialogs or Electron shell behavior
- external process or network seams
- failure injection that is otherwise painful to create
- slow or nondeterministic dependencies

## Time and Scheduling

Scheduling-sensitive tests must control time.

Use `vi.useFakeTimers()` and `vi.setSystemTime(...)` for tests that assert due
dates, review ordering, "introduced today", learning/relearning timing, or
Frontier consumption.

Disable fuzz through settings when a test needs deterministic scheduling.

Assert exact scheduling only when the exact value is the behavior under test.
Otherwise assert stable domain facts: state changed, a due date is in the future,
a review log was written, a Review unit is included or excluded, or the Frontier
count changed.

## Validation Commands

Fast local default for most changes:

```bash
npm run typecheck
npm run lint
npm run test --workspace apps/desktop
```

When main, preload, shared, or Electron packaging changes:

```bash
npm run typecheck
npm run lint
npm run test --workspace apps/desktop
npm run package --workspace apps/desktop
npm run check:package --workspace apps/desktop
```

When user journeys, profile windows, import/export dialogs, or Electron wiring
changes:

```bash
npm run test:e2e:build --workspace apps/desktop
npm run check:package --workspace apps/desktop
npm run test:e2e --workspace apps/desktop
```

For MCP changes:

```bash
npm run test:mcp --workspace apps/desktop
```

Also run relevant service tests when an MCP tool depends on service behavior.
