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
- Assistant conversations are persisted locally inside the active Profile.
- The Assistant uses Armin's bundled card-writing guidance, derived from the
  domain language and `writing-study-cards` skill, so users do not need to
  install external skills for good in-app behavior.
- The Assistant works through domain tools and Assistant drafts, not by clicking
  around the visible UI.

## Provider model

The first providers are Codex and Claude Code through CLI-backed adapters. Users
install and authenticate those tools themselves, then select the provider in
Armin. Armin invokes the local authenticated runtime instead of storing provider
API keys.

Each provider adapter is responsible for provider-specific session startup,
streaming events, cancellation, and tool-call/result exchange. The rest of Armin
talks to a provider-neutral Assistant runtime.

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
   stream, cancellation, and empty/error states.
2. Add Profile-scoped persistence for Assistant conversations.
3. Define the provider-neutral Assistant runtime and a CLI-backed provider
   adapter interface.
4. Implement one provider adapter end to end before adding the second.
5. Add the in-process Assistant tool adapter over existing deck, flashcard, and
   prerequisite graph services.
6. Add Draft mode for hierarchy creation and deck/card proposals.
7. Add Autonomous mode for non-delete writes, with delete confirmation remaining
   outside autonomous execution.
8. Bundle Armin's assistant instruction pack from domain language and
   `writing-study-cards` guidance.
