# The prerequisite graph is global; decks are organizational folders

Decks exist to organize and label material, not to bound knowledge. The
prerequisite graph is intended to be **global** — a flashcard in one deck can be a
prerequisite for a flashcard in another (e.g. an "Algebra" deck securing a
"Calculus" deck) — because real prerequisite chains cross subject boundaries and
that crossing is the core value of the app.

Today the code constrains prerequisite edges to a single deck (`graph.ts`), which
is a **temporary** limitation, not the intended model. Review already spans decks
(`getGlobalQueue`), so the per-deck wall on structure is an inconsistency to be
lifted. Lifting it touches cycle detection, the per-deck canvas, and lock
recomputation, so it is recorded here as a known deferred direction rather than a
permanent decision.
