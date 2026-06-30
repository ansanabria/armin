# MCP exposes atomic primitives for UI parity plus batch workflow tools

The MCP server gives agents the same capabilities a user has in the UI through
**atomic primitive tools** — create, read, **update** (content and type),
**archive**, **delete** a flashcard; **add** and **remove** a prerequisite
(including attaching to already-existing flashcards); deck and graph edits. On top
of those, a small number of **coarse workflow tools** (e.g.
`import_flashcard_hierarchy`) exist for high-frequency bulk authoring.

We keep both rather than going fully atomic or fully coarse. Atomic primitives are
the contract that guarantees UI parity and handle the long tail of incremental
edits. The batch tool earns its place for the headline "turn a topic/article into
a whole deck" workflow: composing that from atomic calls is a round-trip storm,
is not transactional (partial failure leaves a half-built graph), and forces
create-then-read-UUID sequencing that the batch tool's `clientId` indirection
avoids.

Constraint: coarse tools must be thin transactional orchestrations over the same
service primitives (see ADR 0005), never a parallel implementation. "Does a lot"
must mean "batches the primitives," not "a second code path."
