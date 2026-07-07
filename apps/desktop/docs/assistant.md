# Assistant

The Assistant is Armin's product-native AI workflow for creating and managing
study material. It lives in a right sidebar and helps the learner turn topics,
notes, articles, and existing profile context into decks, flashcards, and
prerequisite graphs.

The MCP server remains available for users who want to connect Armin to an
external agent harness. The Assistant is the default in-app path.

## Product shape

- The Assistant can read the active Profile's decks, flashcards, and prerequisite
  graphs by default.
- The Assistant cannot read across Profiles. Switching Profiles switches the
  Assistant's available context.
- Assistant conversations are persisted locally inside the active Profile and do
  not carry across Profiles.
- The Assistant uses Armin's bundled card-writing guidance, derived from the
  domain language and `writing-study-cards` skill, so users do not need to
  install external skills for good in-app behavior.
- The Assistant works through domain tools and Assistant drafts, not by clicking
  around the visible UI.

## Provider model

The first providers are Codex, Claude Code, and OpenCode through SDK-backed,
provider-managed local adapters. Users install and authenticate or configure
those tools themselves, then select the provider in Armin. Armin invokes the
local harness through its SDK instead of storing provider passwords,
subscription credentials, or API keys for these adapters.

Armin does not install providers automatically in the first version. If a
provider is not installed, the Assistant shows setup guidance with a link to the
provider's official installation instructions and a way to check again after the
learner installs it.

Codex and Claude Code are expected to use their own local authentication flows so
learners can use their subscriptions. OpenCode is treated as a local
multi-provider runtime: Armin detects whether OpenCode is installed and has a
usable configured provider, but does not collect OpenCode provider API keys in
the first version.

Each provider adapter is responsible for provider-specific session startup,
streaming events, cancellation, and tool-call/result exchange. The rest of Armin
talks to a provider-neutral Assistant runtime.

The first chat slice streams or returns Assistant text through the provider SDKs
and keeps writes in Draft mode. It does not yet expose Armin write tools to the
model; applying drafts remains a separate learner-controlled step.

Provider SDK sessions run from an empty per-Profile Assistant workspace outside
Armin's Profile database directories. Armin sends the active Profile's study
context explicitly in the prompt instead of giving provider file tools access to
the app's global user-data directory.

Conversation history is stored in the Profile SQLite database. Runtime provider
session handles are not durable; after restart, Armin reloads the visible
conversation and includes recent history in the next provider prompt.

## Provider setup states

The Assistant sidebar should render provider setup as a normal onboarding state,
not as a failed conversation. Each provider can report one of these states:

```ts
type AssistantProviderStatus =
  | { state: "not_installed"; installUrl: string }
  | { state: "installed_not_authenticated"; connectLabel: string }
  | { state: "installed_not_configured"; configureUrl?: string }
  | { state: "ready"; accountLabel?: string }
  | { state: "error"; message: string };
```

When no provider is ready, chat input is disabled and the sidebar shows provider
cards instead. A missing provider card should include the provider name, a short
explanation, an installation link, and a **Check again** action. Advanced
terminal commands may be available behind an advanced section, but terminal
commands are not the primary setup UX.

## Tool model

The Assistant uses an in-process tool adapter over the same application services
used by the UI and MCP server. It should expose the same categories of capability
as the MCP contract:

- Profile/deck context reads.
- Deck creation.
- Flashcard creation and updates.
- Flashcard archive and delete, with delete guarded separately.
- Prerequisite edge creation and removal.
- Batch import of a flashcard hierarchy.
- Graph reads for a specific deck.

Tool implementations must remain thin orchestrations over existing study
services. They must not duplicate flashcard validation, review-unit generation,
or prerequisite graph rules.

## Write modes

Draft mode is the default. The Assistant prepares an Assistant draft, then the
learner reviews and applies it. This is the normal flow for creating a deck,
importing a flashcard hierarchy, or making broad edits.

Autonomous mode can be explicitly enabled when the learner wants the Assistant to
apply safe writes directly. In Autonomous mode, the Assistant may create decks,
create and update flashcards, edit prerequisite relationships, and archive
flashcards.

Deleting a flashcard always requires explicit confirmation, even in Autonomous
mode, because deletion permanently destroys review history and prerequisite
relationships.

## First implementation slices

1. Add Assistant shell UI as a right sidebar with provider selection, message
   stream, cancellation, and setup/empty/error states.
2. Add a provider registry for Codex, Claude Code, and OpenCode.
3. Add local installation detection and provider status cards.
4. Add installation-instructions links and a **Check again** flow for missing
   providers.
5. Add provider readiness checks: Codex authentication, Claude Code
   authentication, and OpenCode provider configuration.
6. Add Profile-scoped persistence for Assistant conversations.
7. Define the provider-neutral Assistant runtime and provider-managed local
   adapter interface.
8. Implement one provider adapter end to end before adding the others.
9. Add the in-process Assistant tool adapter over existing deck, flashcard, and
   prerequisite graph services.
10. Add Draft mode for hierarchy creation and deck/card proposals.
11. Add Autonomous mode for non-delete writes, with delete confirmation remaining
   outside autonomous execution.
12. Bundle Armin's assistant instruction pack from domain language and
   `writing-study-cards` guidance.
