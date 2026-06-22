# Archived prerequisites are inert for locking

When a prerequisite flashcard is archived, it neither blocks nor is required by
its dependents: lock recomputation ignores archived prerequisites, so a dependent
unlocks as if that edge were absent. We chose this over freezing securedness at
archive time (the current behavior) and over disallowing archiving of flashcards
that have dependents.

The deciding case is archiving an **unsecured** prerequisite. Archived flashcards
are excluded from review, so an unsecured one can never gain stability, never
secure, and would keep its dependents **permanently locked** with no path to
unlock — a silent trap that contradicts the "honest, show the structure"
principle. Archiving is an explicit "not part of active study" signal, so an
archived prerequisite should stop gating its dependents. The accepted cost is that
archiving becomes a deliberate way to bypass a prerequisite; that is the learner's
choice on their own data.

Implementation note: lock computation (`getFlashcardsSecured` /
`computeLockedByFlashcardIds`) must skip archived prerequisite edges rather than
counting their (unsecurable) review units.
