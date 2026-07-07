# In-app assistant uses profile-scoped tool adapters

Armin's primary AI card-creation experience is an in-app Assistant in a right
sidebar. External agent harnesses can still connect through the MCP server, but
the in-app Assistant does not loop back through that server. It uses an
in-process tool adapter backed by the same application services as the UI and MCP
tools.

We chose this because the Assistant is core product UI, not an external
integration. Calling the local MCP server from inside the app would make the
main AI experience depend on an embedded integration server and network
loopback. Separate provider-native tool implementations would be faster to
prototype, but would create another write path for flashcard invariants. The
adapter must therefore route writes through the existing service chokepoints
described in ADR 0005 and expose primitive and batch operations consistent with
ADR 0006.

The first provider integrations are CLI-backed adapters for Codex and Claude
Code. Users authenticate those tools outside Armin and Armin invokes the local
authenticated runtime, so Armin does not custody API keys and users can rely on
their own subscriptions. Provider-specific session, streaming, and tool-call
mechanics stay behind a common Assistant provider interface.

Assistant reads and conversations are scoped to the active Profile. The Assistant
may read profile-wide study context by default while that Profile is active, but
it must not read across other open Profiles unless the learner switches Profile
context. Assistant conversations are persisted inside the Profile so they move
with copied profile data and cannot bleed into other Profiles.

The default write mode is Draft. In Draft mode, the Assistant proposes an
Assistant draft and the learner applies it. Autonomous mode can be explicitly
enabled for a conversation or session. In Autonomous mode the Assistant may
create decks, create or update flashcards, edit prerequisite relationships, and
archive flashcards. It must still require explicit confirmation before deleting a
flashcard because delete is permanent; archive remains the reversible cleanup
path under ADR 0007.

The Assistant does not drive the UI as an automation layer. It operates through
domain tools and drafts; the sidebar and main app render proposed and resulting
state. This keeps the feature deterministic, testable, and aligned with the
existing local-first study model.

Consequence: the MCP server remains the public integration contract for external
agents, while the Assistant becomes the product-native contract for AI-assisted
card creation. Both contracts share services and domain invariants rather than
sharing transport.
