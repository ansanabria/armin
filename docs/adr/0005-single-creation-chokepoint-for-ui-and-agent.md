# All flashcard creation funnels through one service chokepoint

Flashcard creation — from the UI and from the MCP/agent path alike — goes through
a single shared service function that validates content, normalizes it (e.g.
explicit cloze cluster numbering), and generates review units. The MCP
`import_flashcard_hierarchy` importer keeps its batch transaction and `clientId`
resolution, but routes the actual flashcard + review-unit creation through the
same service that `create_flashcard`/the UI uses, instead of reimplementing
inserts.

We chose this because content invariants must hold identically no matter who
authors a flashcard, and "AI-assisted creation" is a core principle — the agent
path is the one we can least afford to let drift. A duplicate creation path
(today's importer reimplements unit generation and insertion) means every future
invariant has to be hand-duplicated or the agent silently produces lower-integrity
data. One chokepoint enforces each rule once.

Consequence: the importer gives up some freedom to optimize its own write path; in
exchange the UI↔agent contract for creating flashcards is guaranteed identical.
