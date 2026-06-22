# Testing Philosophy

Armin's tests protect persisted study-state invariants. The core contract is:
given a Profile database, service operations must preserve the relationships
between Flashcards, Review units, the Prerequisite graph, Frontier selection, and
scheduling regardless of whether the caller is the UI, MCP, import, or future
automation.

## Center of Gravity

Service tests against a real temporary SQLite Profile database are the default.
They are the right place to test domain behavior because the highest-risk bugs
are persisted-state bugs: a Locked flashcard entering review, a Secured
prerequisite failing to unlock dependents, a Frontier cap being applied per Deck,
or delete/archive leaving the Prerequisite graph inconsistent.

Prefer service tests for:

- Flashcard creation, update, archive, and delete behavior
- Review unit generation, scheduling, and review logs
- Secured and Locked flashcard transitions
- Prerequisite graph edges, cycles, propagation, and layout persistence
- Frontier selection
- Profile isolation
- import, export, and restore behavior
- MCP parity with UI behavior when the behavior is domain-owned
- migrations and persisted shape changes

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

Renderer tests are for local UI logic only. They should not duplicate service
invariants.

Use renderer tests for:

- graph layout calculations
- image occlusion reveal rules
- keyboard or navigation state machines
- form serialization or parsing owned by the renderer
- canvas gesture orchestration that can be tested without Electron

Do not use renderer tests to prove whether Locked flashcards are excluded from
review, delete removes review history, Frontier caps are enforced, or Secured
requires every Review unit. Those belong in service tests.

## E2E Tests

E2E tests provide wiring and journey confidence. Keep them sparse.

Use E2E tests to prove critical paths work across Electron, preload, IPC, and
renderer:

- create and open a Profile
- create a Deck
- create a Flashcard
- complete a review session
- edit the Prerequisite graph through the canvas
- archive or delete with visible consequence confirmation
- import, export, or restore when those journeys are touched

Do not push every domain edge case through E2E. Domain edge cases belong in
service tests because they are faster, clearer, and more deterministic.

## Coverage

Armin does not use numeric coverage targets as the definition of "tested".
Coverage means the behavior's important scenarios and failure modes are asserted
at the right layer.

Add or update tests when a change touches:

- Flashcard creation, update, archive, or delete
- Review unit generation or scheduling
- Secured or Locked flashcard transitions
- Prerequisite graph edges or propagation
- Frontier selection
- Profile isolation
- import, export, or restore
- IPC, preload, or shared command contracts
- MCP tools or UI parity
- migrations

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
npm test
```

When main, preload, shared, or Electron packaging changes:

```bash
npm run typecheck
npm run lint
npm test
npm run package
```

When user journeys, profile windows, import/export dialogs, or Electron wiring
changes:

```bash
npm run test:e2e:build
npm run test:e2e
```

For MCP changes:

```bash
npm run test:mcp
```

Also run relevant service tests when an MCP tool depends on service behavior.
